import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CompositionDetails from "./pages/CompositionDetails"; // Renamed
import Compositions from "./pages/Compositions"; // Renamed
import Settings from "./pages/Settings";
import CompositionScript from "./pages/CompositionScript";
import { SessionContextProvider } from "./integrations/supabase/session-context";
import ProtectedRoute from "./components/ProtectedRoute";
import DragDropOverlay from "./components/DragDropOverlay";
import AppLayout from "./components/AppLayout";

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
                  <Route path="/composition/:id" element={<CompositionDetails />} /> {/* Updated path */}
                  <Route path="/compositions" element={<Compositions />} /> {/* Updated path */}
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