// Only known application destinations may survive an authentication round trip.
export function authDestination(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return "/library";
  const url = new URL(value, "https://teech.invalid");
  if (
    url.origin !== "https://teech.invalid" ||
    !/^\/(?:library|new|learn\/(?:new|[a-fA-F0-9-]{36})|teach\/[a-fA-F0-9-]{36})$/.test(
      url.pathname,
    )
  )
    return "/library";
  return `${url.pathname}${url.search}${url.hash}`;
}
export function signInPath(destination: string) {
  return `/signin?${new URLSearchParams({ next: authDestination(destination) })}`;
}
