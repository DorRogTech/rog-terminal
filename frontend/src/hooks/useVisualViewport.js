import { useState, useEffect } from 'react';

/**
 * Custom hook that tracks window.visualViewport.
 * Returns { height, offsetTop, isKeyboardOpen }.
 * Sets CSS custom property --viewport-height on document.documentElement.
 */
export default function useVisualViewport() {
  const [state, setState] = useState(() => {
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    return {
      height: h,
      offsetTop: vv ? vv.offsetTop : 0,
      isKeyboardOpen: false,
    };
  });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const fullHeight = window.innerHeight;

    function update() {
      const h = vv.height;
      const isKeyboardOpen = fullHeight - h > 100;

      setState({
        height: h,
        offsetTop: vv.offsetTop,
        isKeyboardOpen,
      });

      document.documentElement.style.setProperty('--viewport-height', `${h}px`);

      if (isKeyboardOpen) {
        document.body.classList.add('keyboard-open');
      } else {
        document.body.classList.remove('keyboard-open');
      }
    }

    update();

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.body.classList.remove('keyboard-open');
    };
  }, []);

  return state;
}
