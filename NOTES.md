# Notes

Branch: auto/2026-07-30 (never commit to main)

Key decisions:
- Shared types extracted to src/types/improvisation.ts — consolidates 6 duplicate Improvisation interface definitions
- useStreakTracker extracted to src/hooks/useStreakTracker.ts — removes inline logic from Index.tsx
- External URLs consolidated in src/lib/constants.ts — removes duplication between Index.tsx and ImprovisationTabs.tsx
- Sidebar active state uses startsWith for Dashboard route so /improvisation/:id highlights it
- Removed 6 unused imports (lucide icons, cn utility)

Unused shadcn/ui components (15) — candidates for deletion:
accordion, aspect-ratio, breadcrumb, carousel, command, context-menu,
hover-card, input-otp, menubar, navigation-menu, pagination, popover,
resizable, table, toggle-group
