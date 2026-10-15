export function useRouter() {
  return {
    push: (path: string) => {
      window.location.href = path;
    },
    refresh: () => {},
  };
}
