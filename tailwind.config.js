import colors from 'tailwindcss/colors'
import { agentPrismTailwindColors } from './src/components/agent-prism/theme/index.ts'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
    "./src/components/agent-prism/**/*.{ts,tsx}",
  ],
  safelist: [
    // Safelist theme colors to ensure they're always available
    { pattern: /^(bg|text|border|hover:bg|hover:text|hover:border|dark:text|from|to)-theme-(50|100|200|300|400|500|600|700|800|900)/ },
  ],
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		colors: {
  			...agentPrismTailwindColors,
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			theme: 'colors.emerald',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			shimmer: {
  				'0%': {
  					backgroundPosition: '-200% 0'
  				},
  				'100%': {
  					backgroundPosition: '200% 0'
  				}
  			},
  			'glow-pulse': {
  				'0%, 100%': {
  					opacity: '0.3'
  				},
  				'50%': {
  					opacity: '0.6'
  				}
  			},
  			'progress-slide': {
  				'0%': {
  					transform: 'translateX(-100%)'
  				},
  				'100%': {
  					transform: 'translateX(400%)'
  				}
  			},
  			'highlight-flash': {
  				'0%': {
  					boxShadow: '0 0 0 0 hsl(var(--primary) / 0.7)'
  				},
  				'50%': {
  					boxShadow: '0 0 0 4px hsl(var(--primary) / 0.4)'
  				},
  				'100%': {
  					boxShadow: '0 0 0 0 hsl(var(--primary) / 0)'
  				}
  			},
  			'audio-wave': {
  				'0%, 100%': {
  					transform: 'scaleY(0.4)'
  				},
  				'50%': {
  					transform: 'scaleY(1)'
  				}
  			},
  			'loading-progress': {
  				'0%': { width: '0%' },
  				'50%': { width: '100%' },
  				'100%': { width: '0%' }
  			},
  			'record-highlight': {
  				'0%': {
  					boxShadow: 'inset 0 0 0 1.5px rgba(139,92,246,0.8), 0 0 12px 2px rgba(139,92,246,0.2)',
  				},
  				'40%': {
  					boxShadow: 'inset 0 0 0 1.5px rgba(139,92,246,0.5), 0 0 6px 1px rgba(139,92,246,0.1)',
  				},
  				'100%': {
  					boxShadow: 'inset 0 0 0 0px rgba(139,92,246,0), 0 0 0px 0px rgba(139,92,246,0)',
  				},
  			},
  			'pulse-out': {
  				'0%, 100%': { transform: 'scale(1)', opacity: '1' },
  				'50%': { transform: 'scale(1.08)', opacity: '0.5' },
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			shimmer: 'shimmer 2.5s ease-in-out infinite',
  			'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
  			'progress-slide': 'progress-slide 1.5s ease-in-out infinite',
  			'highlight-flash': 'highlight-flash 1s ease-out',
  			'audio-wave': 'audio-wave 0.6s ease-in-out infinite',
  			'loading-progress': 'loading-progress 2s ease-in-out infinite',
  			'record-highlight': 'record-highlight 2s ease-out forwards',
  			'pulse-out': 'pulse-out 3s ease-in-out infinite'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}