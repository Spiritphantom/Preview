// oxlint-disable unicorn/consistent-function-scoping
import { beforeEach, describe, expect, it, vi } from "vitest";

// Interaction-level test for the examples/todo-app demo: proves the Preview
// engine's keyed reconciliation and registry cleanup work correctly inside a
// real small application, not just in isolated engine unit tests.

async function mountDemo() {
  document.body.innerHTML = '<div id="app"></div>';
  vi.resetModules();
  await import("../examples/todo-app/main.ts");
}

function addTodo(text: string) {
  const input = document.querySelector<HTMLInputElement>("input[name='text']")!;
  input.value = text;
  document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true }));
}

function todoTexts() {
  return [...document.querySelectorAll("li span")].map((node) => node.textContent);
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("Todo demo — add", () => {
  it("adds a new item to the list and clears the input", async () => {
    await mountDemo();
    addTodo("Buy milk");
    expect(todoTexts()).toEqual([
      "Write the rendering engine",
      "Fix keyed list diffing",
      "Prove it on a real app",
      "Buy milk",
    ]);
    expect(document.querySelector<HTMLInputElement>("input[name='text']")?.value).toBe("");
  });

  it("ignores an empty submission", async () => {
    await mountDemo();
    addTodo("   ");
    expect(todoTexts().length).toBe(3);
  });
});

describe("Todo demo — remove", () => {
  it("removes the correct item and unregisters its checkbox ref-free state cleanly", async () => {
    await mountDemo();
    const items = document.querySelectorAll("li");
    const middleRemoveButton =
      items[1]!.querySelector<HTMLButtonElement>("[data-action='remove']")!;
    middleRemoveButton.click();
    expect(todoTexts()).toEqual(["Write the rendering engine", "Prove it on a real app"]);
  });
});

describe("Todo demo — reorder", () => {
  it("moves an item up and preserves its DOM node identity", async () => {
    await mountDemo();
    const beforeThirdItemSpan = document.querySelectorAll("li")[2]!.querySelector("span");

    const moveUpButtons = document.querySelectorAll<HTMLButtonElement>("[data-action='move-up']");
    moveUpButtons[2]!.click(); // move "Prove it on a real app" up one position

    expect(todoTexts()).toEqual([
      "Write the rendering engine",
      "Prove it on a real app",
      "Fix keyed list diffing",
    ]);
    // same span element, just repositioned — not rebuilt — proving keyed reconciliation
    expect(document.querySelectorAll("li")[1]!.querySelector("span")).toBe(beforeThirdItemSpan);
  });

  it("does nothing when moving the first item up or the last item down", async () => {
    await mountDemo();
    document.querySelectorAll<HTMLButtonElement>("[data-action='move-up']")[0]!.click();
    document.querySelectorAll<HTMLButtonElement>("[data-action='move-down']")[2]!.click();
    expect(todoTexts()).toEqual([
      "Write the rendering engine",
      "Fix keyed list diffing",
      "Prove it on a real app",
    ]);
  });
});

describe("Todo demo — toggle", () => {
  it("marks an item done and applies the done class", async () => {
    await mountDemo();
    const thirdItem = document.querySelectorAll("li")[2]!;
    expect(thirdItem.className).toBe("");
    thirdItem.querySelector<HTMLInputElement>("[data-action='toggle']")!.click();
    expect(document.querySelectorAll("li")[2]!.className).toBe("done");
  });
});
