import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ImprovisationDetails from "./pages/ImprovisationDetails"; // Import new details page
import { SessionContextProvider } from "./integrations/supabase/session-context";
import ProtectedRoute from "./components/ProtectedRoute";
import DragDropOverlay from "./components/DragDropOverlay"; // Import DragDropOverlay

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionContextProvider>
          <DragDropOverlay>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Index />} />
                <Route path="/improvisation/:id" element={<ImprovisationDetails />} /> {/* New route */}
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