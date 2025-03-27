import { ChakraProvider, Box, Container, extendTheme, Spinner, Center } from '@chakra-ui/react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Landing } from './Landing';
import { lazy, Suspense, createContext, useEffect, useState, useContext } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Navbar from './Navbar';
import Terms from './Terms';
import Privacy from './Privacy';
import Login from './Login';
import SignUp from './SignUp';
import Forgot from './Forgot';
import Reset from './Reset';
import Profile from './Profile';
import { BottomNavigationBar } from './BottomNavigationBar';

// Lazy load components
const Admin = lazy(() => import('./Admin'));
const Feedback = lazy(() => import('./Feedback'));
const Docs = lazy(() => import('./Docs'));
const Dashboard = lazy(() => import('./Dashboard')); // Dashboard route is ready

// API URL Configuration
export const API_URL = import.meta.env.DEV ? 'http://localhost:3000' : 'https://seocheck.pro';

// User Context
export const UserContext = createContext(null);

// Chakra UI Theme Extension
const theme = extendTheme({
    colors: {
        primary: {
            500: '#3498DB' // Blue
        },
        secondary: {
            500: '#2980B9', // Darker Blue
            600: '#2471A3'
        },
        accent: {
            500: '#F1C40F', // Yellow
            600: '#E67E22' // Orange
        },
        background: {
            50: '#F8F9FA', // Light gray background
            100: '#E9ECEF'
        }
    },
    fonts: {
        heading: "'Montserrat', sans-serif",
        body: "'Open Sans', sans-serif"
    },
    styles: {
        global: {
            body: {
                bg: 'background.50', // Apply light gray background globally
                color: 'gray.800'
            }
        }
    }
});

// Loading Component
const LoadingIndicator = () => (
    <Center height="80vh">
        <Spinner size="xl" />
    </Center>
);

// Protected Route Component
const ProtectedRoute = ({ allowedRoles }) => {
    const { user, isLoading } = useContext(UserContext);

    if (isLoading) {
        // Show loading indicator while user state is being determined
        return <LoadingIndicator />;
    }

    if (!user) {
        // Not logged in, redirect to login
        return <Navigate to="/login" replace />;
    }

    // Check roles only if allowedRoles is provided
    if (allowedRoles && !allowedRoles.some((role) => (role === 'admin' ? user.isAdmin : true))) {
        // Logged in but doesn't have the required role (e.g., admin)
        // Redirect non-admins trying to access admin routes
        return <Navigate to="/dashboard" replace />; // Redirect to dashboard or home for unauthorized access
    }

    // Logged in and has permission (or no specific roles required)
    return <Outlet />;
};

// Main App Component
function App() {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true); // Loading state for initial auth check

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            fetch(`${API_URL}/api/profile`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })
                .then(async (res) => {
                    if (res.ok) {
                        return res.json();
                    }
                    // If token is invalid/expired, remove it
                    localStorage.removeItem('token');
                    throw new Error('Invalid or expired token');
                })
                .then((data) => {
                    setUser(data); // Set user data on successful fetch
                })
                .catch((error) => {
                    console.error('Failed to fetch profile:', error.message);
                    setUser(null); // Ensure user is null if fetch fails or token is invalid
                })
                .finally(() => {
                    setIsLoading(false); // Set loading to false after fetch attempt completes
                });
        } else {
            setIsLoading(false); // No token, so not loading user data
        }
    }, []);

    return (
        <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
            <ChakraProvider theme={theme}>
                <Suspense fallback={<LoadingIndicator />}>
                    <UserContext.Provider value={{ user, setUser, isLoading }}>
                        <Router>
                            <Box pb={{ base: '70px', md: '0' }} minH="100vh" bg="background.50">
                                <Navbar />
                                <Container maxW="container.xl" pt={8} pb={16}>
                                    <Routes>
                                        {/* Public Routes */}
                                        <Route path="/" element={<Landing />} />
                                        <Route path="/privacy" element={<Privacy />} />
                                        <Route path="/terms" element={<Terms />} />
                                        <Route path="/login" element={<Login />} />
                                        <Route path="/signup" element={<SignUp />} />
                                        <Route path="/forgot" element={<Forgot />} />
                                        <Route path="/reset-password/:token" element={<Reset />} />
                                        <Route path="/feedback" element={<Feedback />} />
                                        <Route path="/docs/*" element={<Docs />} />

                                        {/* Protected Routes (Require Login) */}
                                        <Route element={<ProtectedRoute />}>
                                            <Route path="/profile" element={<Profile />} />
                                            <Route path="/dashboard" element={<Dashboard />} />
                                            {/* Add other general protected routes here as needed */}
                                        </Route>

                                        {/* Admin Protected Route (Require Login + Admin Role) */}
                                        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                                            <Route path="/admin" element={<Admin />} />
                                        </Route>

                                        {/* Fallback Route - Redirects unknown paths to Landing */}
                                        <Route path="*" element={<Navigate to="/" replace />} />
                                    </Routes>
                                </Container>
                                <BottomNavigationBar />
                            </Box>
                        </Router>
                    </UserContext.Provider>
                </Suspense>
            </ChakraProvider>
        </GoogleOAuthProvider>
    );
}

export default App;