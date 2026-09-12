import { createEngine } from "../../src/createEngine";
import type { VNode } from "../../src/lib/types";

// Small demo app for the Preview engine: add, remove, reorder, and toggle
// items in a todo list. Reordering and removal specifically exercise the
// keyed Case G reconciliation and registry cleanup added to createEngine.

type Todo = { id: string; text: string; done: boolean };

let todos: Todo[] = [
  { id: "1", text: "Write the rendering engine", done: true },
  { id: "2", text: "Fix keyed list diffing", done: true },
  { id: "3", text: "Prove it on a real app", done: false },
];
let nextId = 4;

function addTodo(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  todos = [...todos, { id: String(nextId++), text: trimmed, done: false }];
  engine.render();
  engine.dispatch("todo-input", "focus");
}

function removeTodo(id: string) {
  todos = todos.filter((todo) => todo.id !== id);
  engine.render();
}

function toggleTodo(id: string) {
  todos = todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo));
  engine.render();
}

function moveTodo(id: string, direction: -1 | 1) {
  const index = todos.findIndex((todo) => todo.id === id);
  const targetIndex = index + direction;
  if (index === -1 || targetIndex < 0 || targetIndex >= todos.length) return;

  const next = [...todos];
  [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
  todos = next;
  engine.render();
}

function buildTree(): VNode {
  return {
    tag: "div",
    attrs: { className: "todo-app" },
    children: [
      { tag: "h1", children: "Preview engine — todo demo" },
      {
        tag: "form",
        attrs: { "data-action": "submit" },
        children: [
          {
            tag: "input",
            key: "todo-input",
            ref: "todo-input",
            attrs: { type: "text", placeholder: "Add a task", name: "text" },
            actions: { focus: (el) => el.focus() },
          },
          { tag: "button", attrs: { type: "submit" }, children: "Add" },
        ],
      },
      {
        tag: "ul",
        children: todos.map((todo) => ({
          tag: "li",
          key: todo.id,
          attrs: { className: todo.done ? "done" : "" },
          children: [
            {
              tag: "input",
              attrs: { type: "checkbox", checked: todo.done, "data-action": "toggle" },
              onMount: (el) => {
                el.dataset["id"] = todo.id;
              },
            },
            { tag: "span", children: todo.text },
            {
              tag: "button",
              attrs: { type: "button", "data-action": "move-up" },
              onMount: (el) => {
                el.dataset["id"] = todo.id;
              },
              children: "↑",
            },
            {
              tag: "button",
              attrs: { type: "button", "data-action": "move-down" },
              onMount: (el) => {
                el.dataset["id"] = todo.id;
              },
              children: "↓",
            },
            {
              tag: "button",
              attrs: { type: "button", "data-action": "remove" },
              onMount: (el) => {
                el.dataset["id"] = todo.id;
              },
              children: "Remove",
            },
          ],
        })),
      },
    ],
  };
}

const container = document.querySelector<HTMLDivElement>("#app");
if (!container) throw new Error("#app not found");

const engine = createEngine(buildTree);
const { link } = engine.mount(container);

link({
  submit: {
    submit: (_el, e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const input = form.elements.namedItem("text") as HTMLInputElement;
      addTodo(input.value);
      form.reset();
    },
  },
  click: {
    toggle: (el) => toggleTodo(el.dataset["id"]!),
    "move-up": (el) => moveTodo(el.dataset["id"]!, -1),
    "move-down": (el) => moveTodo(el.dataset["id"]!, 1),
    remove: (el) => removeTodo(el.dataset["id"]!),
  },
});
