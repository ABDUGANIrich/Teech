import { expect, type Locator } from "@playwright/test";

// Screenshots are review aids, not assertions. Check real text against the
// composed background, including translucent card layers and foregrounds.
export async function expectReadableText(locator: Locator, minimum = 4.5) {
  await expect(
    locator.first(),
    "the readability selector must match visible content",
  ).toBeVisible();
  const count = await locator.count();
  expect(count).toBeGreaterThan(0);
  for (const node of await locator.all()) await expect(node).toBeVisible();
  const results = await locator.evaluateAll((nodes) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const values = [...context.getImageData(0, 0, 1, 1).data];
      return [values[0], values[1], values[2], values[3] / 255];
    };
    const over = (foreground: number[], background: number[]) =>
      background
        .slice(0, 3)
        .map(
          (value, i) =>
            foreground[i] * foreground[3] + value * (1 - foreground[3]),
        );
    const luminance = (channels: number[]) =>
      channels.reduce((sum, value, i) => {
        const c = value / 255;
        return (
          sum +
          (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) *
            [0.2126, 0.7152, 0.0722][i]
        );
      }, 0);
    return nodes.map((node) => {
      const ancestors: Element[] = [];
      for (
        let current: Element | null = node;
        current;
        current = current.parentElement
      )
        ancestors.unshift(current);
      let background = [255, 255, 255];
      let opacity = 1;
      for (const ancestor of ancestors) {
        const style = getComputedStyle(ancestor);
        background = over(rgba(style.backgroundColor), background);
        opacity *= Number(style.opacity);
      }
      const color = rgba(getComputedStyle(node).color);
      color[3] *= opacity;
      const foreground = over(color, background);
      const a = luminance(foreground),
        b = luminance(background);
      return {
        text: node.textContent?.trim().slice(0, 100),
        contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
  });
  for (const result of results) {
    expect(result.text, "matched text must not be empty").toBeTruthy();
    expect(
      result.contrast,
      `unreadable text: ${result.text}`,
    ).toBeGreaterThanOrEqual(minimum);
  }
}
