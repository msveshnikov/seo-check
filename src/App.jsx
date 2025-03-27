import { ChakraProvider, Box, Container, VStack, extendTheme } from '@chakra-ui/react';
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
const Dashboard = lazy(() => import('./Dashboard')); // Assuming Dashboard.jsx will be created

// API URL Configuration
export const API_URL = import.meta.env.DEV ? 'http://localhost:3000' : 'https://seocheck.pro'; // Updated API URL

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

// Protected Route Component
const ProtectedRoute = ({ allowedRoles }) => {
    const { user, isLoading } = useContext(UserContext);

    if (isLoading) {
        // Optional: Show a loading indicator while user state is being determined
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
                Loading...
            </Box>
        );
    }

    if (!user) {
        // Not logged in, redirect to login
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.some((role) => (role === 'admin' ? user.isAdmin : true))) {
        // Logged in but doesn't have the required role (e.g., admin)
        return <Navigate to="/" replace />; // Redirect to home or an 'Unauthorized' page
    }

    // Logged in and has permission
    return <Outlet />;
};

// Main App Component
function App() {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true); // Add loading state

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
                    throw new Error('Invalid token');
                })
                .then((data) => {
                    setUser(data);
                })
                .catch((error) => {
                    console.error('Failed to fetch profile:', error);
                    setUser(null); // Ensure user is null if fetch fails
                })
                .finally(() => {
                    setIsLoading(false); // Set loading to false after fetch attempt
                });
        } else {
            setIsLoading(false); // No token, so not loading user data
        }
    }, []);

    return (
        <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
            <ChakraProvider theme={theme}>
                <Suspense
                    fallback={
                        <Box
                            display="flex"
                            justifyContent="center"
                            alignItems="center"
                            height="100vh"
                            bg="background.50"
                        >
                            Loading...
                        </Box>
                    }
                >
                    <UserContext.Provider value={{ user, setUser, isLoading }}>
                        <Router>
                            {/* Use future flags if needed, or remove if using React Router v6 */}
                            {/* <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}> */}
                            <Box pb={{ base: '70px', md: '0' }} minH="100vh" bg="background.50">
                                {' '}
                                {/* Adjust padding for BottomNav */}
                                <Navbar />
                                <Container maxW="container.xl" pt={8} pb={16}>
                                    {' '}
                                    {/* Add padding top/bottom */}
                                    {/* Removed VStack spacing={8} for more flexible layout within routes */}
                                    <Routes>
                                        {/* Public Routes */}
                                        <Route path="/" element={<Landing />} />
                                        {/* <Route path="/research" element={<Landing />} /> */}{' '}
                                        {/* Removed duplicate */}
                                        <Route path="/privacy" element={<Privacy />} />
                                        <Route path="/terms" element={<Terms />} />
                                        <Route path="/login" element={<Login />} />
                                        <Route path="/signup" element={<SignUp />} />
                                        <Route path="/forgot" element={<Forgot />} />
                                        <Route path="/reset-password/:token" element={<Reset />} />
                                        <Route path="/feedback" element={<Feedback />} />
                                        <Route path="/docs/*" element={<Docs />} />
                                        {/* Protected Routes */}
                                        <Route element={<ProtectedRoute />}>
                                            <Route path="/profile" element={<Profile />} />
                                            {/* Add Dashboard route when component is ready */}
                                            <Route path="/dashboard" element={<Dashboard />} />
                                        </Route>
                                        {/* Admin Protected Route */}
                                        <Route
                                            element={<ProtectedRoute allowedRoles={['admin']} />}
                                        >
                                            <Route path="/admin" element={<Admin />} />
                                        </Route>
                                        {/* Fallback Route */}
                                        <Route path="*" element={<Navigate to="/" replace />} />
                                    </Routes>
                                </Container>
                                <BottomNavigationBar />
                            </Box>
                            {/* </Router> */}
                        </Router>
                    </UserContext.Provider>
                </Suspense>
            </ChakraProvider>
        </GoogleOAuthProvider>
    );
}

export default App;
