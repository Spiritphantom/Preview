import { applyAttrs, removeAttrs } from "./lib/attrs";
import { initializeEvents, type HandlersByEvent } from "./lib/eventDelegator";
import { SVG_TAGS } from "./lib/svg";
import type { BuiltEl, DOMBuilderEl, Engine, Registry, VNode } from "./lib/types";

const SVG_NS = "http://www.w3.org/2000/svg";

function buildDOM(incomingObject: VNode, registry: Registry): BuiltEl {
  // Destructure properties with safe fallbacks
  const { tag, children, attrs = {}, actions, ref, onMount } = incomingObject;

  // Create the element with correct namespace
  const el = (
    SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag)
  ) as DOMBuilderEl;

  // Register refs and actions
  if (ref !== undefined && actions !== undefined) {
    registry.set(ref, { dom: el, actions });
  }

  // Trigger onMount hook
  if (onMount) {
    (onMount as (el: DOMBuilderEl) => void | Promise<void>)(el);
  }

  // Apply element properties safely
  applyAttrs(el, attrs);

  // Process children inside the object scope context
  if (typeof children === "string") {
    el.textContent = children;
  } else if (Array.isArray(children)) {
    children.forEach((child) => {
      el.appendChild(buildDOM(child, registry));
    });
  }

  return el;
}

function patch(oldVNode: VNode, newVNode: VNode, dom: BuiltEl, registry: Registry) {
  const oldChild = oldVNode.children;
  const newChild = newVNode.children;

  // patch: tag mismatch modification
  if (oldVNode.tag !== newVNode.tag) {
    const parentContainer = dom.parentNode;
    if (parentContainer) {
      unregisterRefs(oldVNode, registry);
      parentContainer.replaceChild(buildDOM(newVNode, registry), dom);
    }
    return;
  }

  // patch: attributes management implementation
  if (oldVNode.attrs && newVNode.attrs && oldVNode.attrs === newVNode.attrs) {
    console.warn(`Same attrs object reused for <${newVNode.tag}>`, newVNode.attrs);
  }
  if (newVNode.attrs) {
    for (const [key, value] of Object.entries(newVNode.attrs)) {
      if (oldVNode.attrs && Object.hasOwn(oldVNode.attrs, key)) {
        if ((oldVNode.attrs as Record<string, unknown>)[key] === value) continue;
      }
      applyAttrs(dom as DOMBuilderEl, { [key]: value });
    }
  }
  if (oldVNode.attrs) {
    for (const [key, value] of Object.entries(oldVNode.attrs)) {
      if (!newVNode.attrs || !Object.hasOwn(newVNode.attrs, key)) {
        removeAttrs(dom as DOMBuilderEl, { [key]: value });
      }
    }
  }

  // --- DETERMINISTIC CHILDREN STRUCTURAL MATRIX ---

  // Case A: Both empty targets
  if (oldChild === undefined && newChild === undefined) return;

  // Case B: Uniform primitive string swap
  if (typeof oldChild === "string" && typeof newChild === "string") {
    if (oldChild !== newChild) dom.textContent = newChild;
    return;
  }

  // Case C: Absolute breakdown removal (Wipe completely)
  if (oldChild !== undefined && newChild === undefined) {
    if (Array.isArray(oldChild)) oldChild.forEach((child) => unregisterRefs(child, registry));
    if (isProperNode(dom)) {
      dom.replaceChildren();
    } else {
      dom.textContent = "";
    }
    return;
  }

  // Case D: Clean structural growth instantiation
  if (oldChild === undefined && newChild !== undefined) {
    if (typeof newChild === "string") {
      dom.textContent = newChild;
    } else {
      replaceChildren(dom, newChild, registry);
    }
    return;
  }

  // Case E: String primitives mutating to Array layouts
  if (typeof oldChild === "string" && Array.isArray(newChild)) {
    replaceChildren(dom, newChild, registry);
    return;
  }

  // Case F: Deep Node Lists normalizing back down to String primitives
  if (Array.isArray(oldChild) && typeof newChild === "string") {
    oldChild.forEach((child) => unregisterRefs(child, registry));
    if (isProperNode(dom) && "replaceChildren" in dom) {
      dom.replaceChildren(document.createTextNode(newChild));
    } else {
      dom.textContent = newChild;
    }
    return;
  }

  // Case G: Structural Matrix Loop (Deep Subtree Array Diffing)
  if (Array.isArray(oldChild) && Array.isArray(newChild)) {
    const isKeyed =
      oldChild.some((child) => child.key !== undefined) ||
      newChild.some((child) => child.key !== undefined);

    if (isKeyed) {
      patchKeyedChildren(oldChild, newChild, dom, registry);
    } else {
      patchUnkeyedChildren(oldChild, newChild, dom, registry);
    }
    return;
  }
}

// Case G, unkeyed: positional patch, safe when the two arrays differ in length
function patchUnkeyedChildren(
  oldChild: VNode[],
  newChild: VNode[],
  dom: BuiltEl,
  registry: Registry,
) {
  const sharedLength = Math.min(oldChild.length, newChild.length);

  for (let index = 0; index < sharedLength; index++) {
    patch(oldChild[index]!, newChild[index]!, dom.childNodes[index] as BuiltEl, registry);
  }

  if (newChild.length > oldChild.length) {
    const fragment = document.createDocumentFragment();
    for (let index = sharedLength; index < newChild.length; index++) {
      fragment.appendChild(buildDOM(newChild[index]!, registry));
    }
    dom.appendChild(fragment);
  } else if (oldChild.length > newChild.length) {
    for (let index = oldChild.length - 1; index >= sharedLength; index--) {
      unregisterRefs(oldChild[index]!, registry);
      dom.childNodes[index]?.remove();
    }
  }
}

// Case G, keyed: reconciles by key so an existing DOM node (and its live input
// state, focus, refs) follows its VNode across reorders instead of being
// rebuilt in place at its new index
function patchKeyedChildren(
  oldChild: VNode[],
  newChild: VNode[],
  dom: BuiltEl,
  registry: Registry,
) {
  const oldByKey = new Map<string | number, { vnode: VNode; node: ChildNode }>();
  oldChild.forEach((vnode, index) => {
    const node = dom.childNodes[index];
    if (node) oldByKey.set(vnode.key ?? index, { vnode, node });
  });

  const usedKeys = new Set<string | number>();
  let cursor: ChildNode | null = dom.firstChild;

  newChild.forEach((vnode, index) => {
    const key = vnode.key ?? index;
    const existing = oldByKey.get(key);
    usedKeys.add(key);

    if (existing) {
      patch(existing.vnode, vnode, existing.node as BuiltEl, registry);
      if (existing.node !== cursor) dom.insertBefore(existing.node, cursor);
      cursor = existing.node.nextSibling;
    } else {
      const built = buildDOM(vnode, registry);
      dom.insertBefore(built, cursor);
      cursor = built.nextSibling;
    }
  });

  oldByKey.forEach(({ vnode, node }, key) => {
    if (!usedKeys.has(key)) {
      unregisterRefs(vnode, registry);
      node.remove();
    }
  });
}

// Recursively removes refs belonging to a subtree that is being discarded, so
// the registry does not grow unbounded as nodes are added and removed
function unregisterRefs(vnode: VNode, registry: Registry) {
  if (vnode.ref !== undefined) registry.delete(vnode.ref);
  if (Array.isArray(vnode.children)) {
    vnode.children.forEach((child) => unregisterRefs(child, registry));
  }
}

function createEngine(buildTree: () => VNode): Engine {
  const registry: Registry = new Map();

  // Track internal state across renders
  let currentVNode: VNode | null = null;
  let rootContainer: HTMLElement | null = null;
  let rootDOMElement: BuiltEl | null = null;

  return {
    mount(container: HTMLElement) {
      if (rootContainer) {
        throw new Error("This engine is already mounted.");
      }

      registry.clear();
      rootContainer = container;

      // Generate the initial tree representation
      currentVNode = buildTree();
      rootDOMElement = buildDOM(currentVNode, registry);

      container.innerHTML = ""; // Clear existing fallback HTML
      container.appendChild(rootDOMElement);

      return {
        link(handlers: HandlersByEvent) {
          initializeEvents(handlers, container);
        },
      };
    },

    render() {
      if (!rootContainer || !currentVNode || !rootDOMElement) {
        throw new Error("Engine must be mounted before rendering updates.");
      }

      // Generate the fresh virtual tree
      const nextVNode = buildTree();

      // Patch the live DOM and update the tree tracking pointer
      patch(currentVNode, nextVNode, rootDOMElement, registry);
      currentVNode = nextVNode;
    },

    dispatch(ref: string, command: string) {
      const meta = registry.get(ref);
      if (!meta) throw new Error(`Ref "${ref}" not found`);
      const action = meta.actions[command];
      if (!action) throw new Error(`Unknown command "${command}"`);
      action(meta.dom);
    },
  };
}

// helper
function isProperNode(el: BuiltEl): el is Exclude<BuiltEl, Text> {
  if (el instanceof HTMLElement || el instanceof SVGElement || el instanceof DocumentFragment) {
    return true;
  } else {
    return false;
  }
}

function replaceChildren(dom: BuiltEl, newChild: VNode[], registry: Registry) {
  dom.textContent = "";
  const fragment = document.createDocumentFragment();
  newChild.forEach((child) => fragment.appendChild(buildDOM(child, registry)));
  dom.appendChild(fragment);
}

export { createEngine };
