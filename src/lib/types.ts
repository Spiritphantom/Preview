import type { HandlersByEvent } from "./eventDelegator";
import type { SVGAttributes } from "./svg";

type Primitive = string | number | boolean | null | undefined;

type ElementAttributes<T extends HTMLElement> = {
  [K in keyof T as T[K] extends Primitive ? K : never]?: T[K];
} & {
  [K in `data-${string}`]?: Primitive;
} & {
  [K in `aria-${string}`]?: Primitive;
};

type ValidTagNameMap = HTMLElementTagNameMap & SVGElementTagNameMap;

type BuiltEl = HTMLElement | SVGElement | Text;
type DOMBuilderEl = HTMLElement | SVGElement;

type VNodeMap = {
  [T in keyof ValidTagNameMap]: {
    tag: T;
    children?: VNode[] | string;
    key?: string | number;
    ref?: string;
    actions?: Record<string, (el: ValidTagNameMap[T]) => void>;
    onMount?: (el: ValidTagNameMap[T]) => void | Promise<void>;
    attrs?: ValidTagNameMap[T] extends HTMLElement
      ? ElementAttributes<ValidTagNameMap[T]>
      : SVGAttributes;
  };
};
type VNode = VNodeMap[keyof VNodeMap];

interface Engine {
  mount(container: HTMLElement): { link: (handlers: HandlersByEvent) => void };
  dispatch(ref: string, command: string): void;
  render(): void;
}

type Registry = Map<string, { dom: DOMBuilderEl; actions: Record<string, (el: any) => void> }>;

export type { VNode, Engine, Registry, BuiltEl, DOMBuilderEl, ValidTagNameMap };
