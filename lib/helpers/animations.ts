import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export const easing = {
  premium: "power3.out",
  smooth: "power2.out",
  inOut: "power2.inOut",
  elastic: "elastic.out(1, 0.5)",
} as const;

export function animateFrom(
  el: gsap.TweenTarget,
  options?: Partial<{
    y: number;
    x: number;
    opacity: number;
    scale: number;
    duration: number;
    stagger: number;
    delay: number;
    ease: string;
    scrollTrigger: ScrollTrigger.Vars;
  }>
) {
  const { y = 60, x = 0, opacity = 0, scale = 1, duration = 1.2, stagger = 0.1, delay = 0, ease = easing.premium, scrollTrigger: st } = options ?? {};
  return gsap.fromTo(
    el,
    { y, x, opacity, scale },
    { y: 0, x: 0, opacity: 1, scale: 1, duration, stagger, delay, ease, scrollTrigger: st }
  );
}

export function createScrollReveal(
  el: gsap.TweenTarget,
  start = "top 85%"
) {
  return animateFrom(el, {
    scrollTrigger: { trigger: el as HTMLElement, start, toggleActions: "play none none reverse" },
  });
}
