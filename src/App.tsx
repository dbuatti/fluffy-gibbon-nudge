import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CompositionDetails from "./pages/CompositionDetails"; // FIX: Updated import from ImprovisationDetails to CompositionDetails
import Improvisations from "./pages/Improvisations"; // Import new page
import Settings from "./pages/Settings"; // Import new page
import CompositionScript from "./pages/CompositionScript"; // Import new page
import { SessionContextProvider } from "./integrations/supabase/session-context";
import ProtectedRoute from "./components/ProtectedRoute";
import DragDropOverlay from "./components/DragDropOverlay";
import AppLayout from "./components/AppLayout"; // Import AppLayout

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SessionContextProvider>
          <DragDropOverlay>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              
              {/* Protected Routes wrapped in AppLayout */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/composition/:id" element={<CompositionDetails />} /> {/* FIX: Updated route path */}
                  <Route path="/improvisations" element={<Improvisations />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/composition-script" element={<CompositionScript />} />
                </Route>
              </Route>

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </DragDropOverlay>
        </SessionContextProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;