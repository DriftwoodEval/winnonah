import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    // Set the initial value
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }

    // Listen for changes
    const listener = () => setMatches(media.matches);
    window.addEventListener("resize", listener);

    // Cleanup the listener on unmount
    return () => window.removeEventListener("resize", listener);
  }, [matches, query]);

  return matches;
}
