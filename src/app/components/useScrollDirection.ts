import { useState, useEffect, RefObject } from "react";

const useScrollDirection = (element: RefObject<HTMLElement | null>): boolean => {
  const [showHeader, setShowHeader] = useState(true);
  const [prevScrollY, setPrevScrollY] = useState(0);

  useEffect(() => {
    if (!element?.current) return;

    const handleScroll = () => {
      const currentScrollY = element.current!.scrollTop;
      const isScrollingDown = currentScrollY > prevScrollY;

      setShowHeader(!isScrollingDown || currentScrollY < 10);
      setPrevScrollY(currentScrollY);
    };

    const scrollElement = element.current;
    scrollElement.addEventListener("scroll", handleScroll);
    return () => scrollElement.removeEventListener("scroll", handleScroll);
  }, [element, prevScrollY]);

  return showHeader;
};

export default useScrollDirection;
