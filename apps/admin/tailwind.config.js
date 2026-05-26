import tailwindcssAnimate from 'tailwindcss-animate'

const msColor = (variable) => ({ opacityValue }) => {
  if (opacityValue === undefined) return `var(${variable})`
  return `color-mix(in srgb, var(${variable}) calc(${opacityValue} * 100%), transparent)`
}

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: msColor('--ms-color-background'),
        foreground: msColor('--ms-color-foreground'),
        card: {
          DEFAULT: msColor('--ms-color-surface-raised'),
          foreground: msColor('--ms-color-foreground'),
        },
        popover: {
          DEFAULT: msColor('--ms-color-surface-raised'),
          foreground: msColor('--ms-color-foreground'),
        },
        primary: {
          DEFAULT: msColor('--ms-color-primary'),
          foreground: msColor('--ms-color-primary-foreground'),
        },
        secondary: {
          DEFAULT: msColor('--ms-color-muted'),
          foreground: msColor('--ms-color-foreground'),
        },
        muted: {
          DEFAULT: msColor('--ms-color-muted'),
          foreground: msColor('--ms-color-muted-foreground'),
        },
        accent: {
          DEFAULT: msColor('--ms-color-muted'),
          foreground: msColor('--ms-color-foreground'),
        },
        destructive: {
          DEFAULT: msColor('--ms-color-danger'),
          foreground: msColor('--ms-color-danger-foreground'),
        },
        info: {
          DEFAULT: msColor('--ms-color-info'),
        },
        success: {
          DEFAULT: msColor('--ms-color-success'),
        },
        warning: {
          DEFAULT: msColor('--ms-color-warning'),
        },
        border: msColor('--ms-color-border'),
        input: msColor('--ms-color-border'),
        ring: msColor('--ms-color-primary'),
        sidebar: {
          DEFAULT: msColor('--ms-color-background'),
          border: msColor('--ms-color-border'),
          foreground: msColor('--ms-color-foreground'),
          muted: msColor('--ms-color-muted-foreground'),
        },
      },
      borderRadius: {
        lg: '12px',
        md: 'var(--ms-radius-md)',
        sm: 'var(--ms-radius-sm)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
