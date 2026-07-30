# Notes

Branch: auto/2026-07-30 (never commit to main)

Key decisions:
- Shared types extracted to src/types/improvisation.ts — consolidates 6 duplicate Improvisation interface definitions
- useStreakTracker extracted to src/hooks/useStreakTracker.ts — removes inline logic from Index.tsx
- External URLs consolidated in src/lib/constants.ts — removes duplication between Index.tsx and ImprovisationTabs.tsx
- Sidebar active state uses startsWith for Dashboard route so /improvisation/:id highlights it
