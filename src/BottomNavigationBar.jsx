import { useContext } from 'react';
import { Box, Icon, Text, useColorModeValue } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { FiHome, FiUser, FiFileText } from 'react-icons/fi';
import { UserContext } from './App'; // Assuming UserContext is exported from App.jsx

export const BottomNavigationBar = () => {
    const { user } = useContext(UserContext);
    const bgColor = useColorModeValue('rgba(255, 255, 255, 0.9)', 'rgba(26, 32, 44, 0.9)');
    const borderColor = useColorModeValue('gray.200', 'gray.700');
    const textColor = useColorModeValue('gray.600', 'gray.200');

    const navItems = [
        { label: 'Home', href: '/', icon: FiHome, requiresAuth: false },
        { label: 'Docs', href: '/docs', icon: FiFileText, requiresAuth: false },
        { label: 'Profile', href: '/profile', icon: FiUser, requiresAuth: true }
    ];

    const filteredNavItems = navItems.filter((item) => !item.requiresAuth || !!user);

    return (
        <Box
            position="fixed"
            bottom="0"
            left="0"
            right="0"
            height="50px"
            bg={bgColor}
            borderTopWidth="1px"
            borderColor={borderColor}
            display={{ base: 'flex', md: 'none' }} // Only show on mobile/small screens
            justifyContent="space-around"
            alignItems="center"
            zIndex={1000}
            fontSize="sm"
            color={textColor}
            sx={{
                '@supports (backdrop-filter: blur(10px))': {
                    backdropFilter: 'blur(10px)'
                }
            }}
        >
            {filteredNavItems.map((item) => (
                <Box
                    key={item.label}
                    as={RouterLink}
                    to={item.href}
                    p={2}
                    display="flex"
                    flexDirection="column"
                    alignItems="center"
                    _hover={{ textDecoration: 'none', color: 'primary.500' }}
                    _activeLink={{ color: 'primary.500' }} // Style for active link (requires NavLink logic or similar)
                >
                    <Icon as={item.icon} boxSize={5} />
                    <Text fontSize="xs">{item.label}</Text>
                </Box>
            ))}
        </Box>
    );
};
