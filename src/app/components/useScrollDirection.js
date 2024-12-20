import { useState, useEffect } from "react";

const useScrollDirection = (element) => {
    const [showHeader, setShowHeader] = useState(true);
    const [prevScrollY, setPrevScrollY] = useState(0);

    useEffect(() => {
        if (!element?.current) return;

        const handleScroll = () => {
            const currentScrollY = element.current.scrollTop;
            const isScrollingDown = currentScrollY > prevScrollY;

            // Show header when scrolled to top or scrolling up
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
