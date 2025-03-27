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
            50: '#EBF8FF',
            100: '#BEE3F8',
            200: '#90CDF4',
            300: '#63B3ED',
            400: '#4299E1',
            500: '#3182CE', // Adjusted primary blue based on Navbar usage
            600: '#2B6CB0',
            700: '#2C5282',
            800: '#2A4365',
            900: '#1A365D'
        },
        secondary: {
            500: '#2980B9', // Darker Blue from README
            600: '#2471A3' // Even Darker Blue from README
        },
        accent: {
            500: '#F1C40F', // Yellow from README
            600: '#E67E22' // Orange from README
        },
        background: {
            50: '#F8F9FA', // Light gray background from README
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
    },
    components: {
        Button: {
            // Example: Overriding default button props
            baseStyle: {
                // _focus: {
                //   boxShadow: 'none', // Optional: Remove default focus outline if needed
                // },
            },
            variants: {
                // Example: Defining a custom variant
                // 'primary-solid': {
                //   bg: 'primary.500',
                //   color: 'white',
                //   _hover: {
                //     bg: 'primary.600',
                //   },
                // },
            },
            defaultProps: {
                // colorScheme: 'primary', // Set default color scheme if desired
            }
        }
        // Add overrides for other components like Card, Input, etc. as needed
    }
});

// Loading Component
const LoadingIndicator = () => (
    <Center height="80vh">
        <Spinner size="xl" color="primary.500" thickness="4px" />
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
        // Not logged in, redirect to login, preserving the intended location
        return <Navigate to="/login" replace state={{ from: window.location.pathname }} />;
    }

    // Check roles only if allowedRoles is provided
    // Assumes user object has an `isAdmin` boolean property or potentially a `roles` array
    const userIsAdmin = user && user.isAdmin === true; // Explicit check for boolean true
    const hasRequiredRole =
        !allowedRoles || allowedRoles.some((role) => (role === 'admin' ? userIsAdmin : true)); // Check if admin role is required and user has it

    if (!hasRequiredRole) {
        // Logged in but doesn't have the required role (e.g., non-admin trying to access admin)
        // Redirect to a default logged-in page, like dashboard
        console.warn(
            `User ${user.email} tried to access a route requiring roles: ${allowedRoles.join(', ')}`
        );
        return <Navigate to="/dashboard" replace />; // Redirect to dashboard for unauthorized access
    }

    // Logged in and has permission (or no specific roles required)
    return <Outlet />; // Render the child route component
};

// Main App Component
function App() {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true); // Loading state for initial auth check

    useEffect(() => {
        const token = localStorage.getItem('token');
        let isMounted = true; // Prevent state update on unmounted component

        const fetchUserProfile = async () => {
            if (!token) {
                setIsLoading(false);
                return;
            }

            try {
                const response = await fetch(`${API_URL}/api/profile`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    // If token is invalid/expired, remove it
                    localStorage.removeItem('token');
                    if (isMounted) setUser(null);
                    throw new Error(`Failed to fetch profile: ${response.statusText}`);
                }

                const userData = await response.json();
                if (isMounted) {
                    setUser(userData); // Set user data on successful fetch
                }
            } catch (error) {
                console.error('Error fetching user profile:', error.message);
                if (isMounted) {
                    setUser(null); // Ensure user is null if fetch fails or token is invalid
                    localStorage.removeItem('token'); // Clean up invalid token
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false); // Set loading to false after fetch attempt completes
                }
            }
        };

        fetchUserProfile();

        // Cleanup function to run when the component unmounts
        return () => {
            isMounted = false;
        };
    }, []); // Empty dependency array ensures this runs only once on mount

    return (
        <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
            <ChakraProvider theme={theme}>
                <Suspense fallback={<LoadingIndicator />}>
                    <UserContext.Provider value={{ user, setUser, isLoading }}>
                        <Router>
                            <Box
                                display="flex"
                                flexDirection="column"
                                minH="100vh"
                                bg="background.50"
                            >
                                <Navbar />
                                <Box flex="1" pb={{ base: '70px', md: '0' }}>
                                    {' '}
                                    {/* Adjust padding for BottomNav */}
                                    <Container maxW="container.xl" pt={8} pb={16}>
                                        <Routes>
                                            {/* Public Routes */}
                                            <Route path="/" element={<Landing />} />
                                            <Route path="/privacy" element={<Privacy />} />
                                            <Route path="/terms" element={<Terms />} />
                                            <Route path="/login" element={<Login />} />
                                            <Route path="/signup" element={<SignUp />} />
                                            <Route path="/forgot" element={<Forgot />} />
                                            <Route
                                                path="/reset-password/:token"
                                                element={<Reset />}
                                            />
                                            <Route path="/feedback" element={<Feedback />} />
                                            {/* Allow nested routes within Docs */}
                                            <Route path="/docs/*" element={<Docs />} />

                                            {/* Protected Routes (Require Login) */}
                                            <Route element={<ProtectedRoute />}>
                                                <Route path="/profile" element={<Profile />} />
                                                <Route path="/dashboard" element={<Dashboard />} />
                                                {/* Add other general protected routes here as needed */}
                                                {/* Example: <Route path="/reports" element={<ReportsList />} /> */}
                                                {/* Example: <Route path="/report/:reportId" element={<ReportDetail />} /> */}
                                            </Route>

                                            {/* Admin Protected Route (Require Login + Admin Role) */}
                                            <Route
                                                element={
                                                    <ProtectedRoute allowedRoles={['admin']} />
                                                }
                                            >
                                                {/* Allow nested routes within Admin */}
                                                <Route path="/admin/*" element={<Admin />} />
                                            </Route>

                                            {/* Fallback Route - Redirects unknown paths to Landing */}
                                            {/* Consider a dedicated 404 component instead? */}
                                            <Route path="*" element={<Navigate to="/" replace />} />
                                        </Routes>
                                    </Container>
                                </Box>
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
