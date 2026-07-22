import React, { Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SessionContextProvider } from "./integrations/supabase/session-context";
import ProtectedRoute from "./components/ProtectedRoute";
import DragDropOverlay from "./components/DragDropOverlay";
import AppLayout from "./components/AppLayout";
import ErrorBoundary from "./components/ErrorBoundary";

import { Loader2 } from "lucide-react";

const Index = React.lazy(() => import("./pages/Index"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const Login = React.lazy(() => import("./pages/Login"));
const Signup = React.lazy(() => import("./pages/Signup"));
const ImprovisationDetails = React.lazy(() => import("./pages/ImprovisationDetails"));
const Settings = React.lazy(() => import("./pages/Settings"));
const CompositionScript = React.lazy(() => import("./pages/CompositionScript"));
const Instructions = React.lazy(() => import("./pages/Instructions"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      {/* Removed <Toaster /> as sonner is used */}
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SessionContextProvider>
          <DragDropOverlay>
            <ErrorBoundary>
            <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              
              {/* Protected Routes wrapped in AppLayout */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/improvisation/:id" element={<ImprovisationDetails />} />
                  {/* Removed /improvisations route as it's no longer a separate page */}
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/composition-script" element={<CompositionScript />} />
                  <Route path="/instructions" element={<Instructions />} />
                </Route>
              </Route>

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </DragDropOverlay>
        </SessionContextProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;