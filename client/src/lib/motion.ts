import {
  useReducedMotion,
  type Variant,
  type Variants,
} from "motion/react"

export const MOTION_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: MOTION_EASE },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15, ease: "easeIn" },
  },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2, ease: MOTION_EASE },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15, ease: "easeIn" },
  },
}

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
}

export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: MOTION_EASE },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2, ease: "easeIn" },
  },
}

function omitTranslate(variant: Variant): Variant {
  if (typeof variant !== "object" || variant === null) {
    return variant
  }
  const { x: _x, y: _y, ...rest } = variant
  return rest
}

export function useReducedMotionVariants(variants: Variants): Variants {
  const prefersReducedMotion = useReducedMotion()
  if (!prefersReducedMotion) {
    return variants
  }
  const reduced: Variants = {}
  for (const [key, value] of Object.entries(variants)) {
    reduced[key] = typeof value === "function" ? value : omitTranslate(value)
  }
  return reduced
}
