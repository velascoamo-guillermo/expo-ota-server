import { Box, Flex, Button, HStack, Text, FlexProps, IconButton, useColorMode, useColorModeValue } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { FaSignOutAlt, FaLayerGroup } from 'react-icons/fa';
import { FiZap, FiSun, FiMoon } from 'react-icons/fi';

export default function Layout({ children, ...props }: { children: React.ReactNode } & FlexProps) {
  const router = useRouter();
  const { toggleColorMode, colorMode } = useColorMode();
  const navBg = useColorModeValue('white', 'gray.900');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  const navItems = [
    { name: 'Channels', path: '/dashboard', icon: <FaLayerGroup /> },
  ];

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    router.push('/');
  };

  return (
    <Box minHeight="100vh" {...props}>
      <Flex
        as="nav"
        w="full"
        px={6}
        h="64px"
        borderBottom="1px solid"
        borderColor={borderColor}
        alignItems="center"
        justifyContent="space-between"
        bg={navBg}
        position="sticky"
        top={0}
        zIndex={10}>
        <HStack spacing={2} as={NextLink} href="/dashboard" _hover={{ textDecoration: 'none' }}>
          <Box color="blue.500">
            <FiZap size={20} />
          </Box>
          <Text fontWeight="bold" fontSize="md" letterSpacing="tight">
            OTA Server
          </Text>
        </HStack>

        <HStack spacing={2}>
          {navItems.map((item) => (
            <Button
              key={item.path}
              size="sm"
              variant={router.pathname.startsWith(item.path) ? 'solid' : 'ghost'}
              colorScheme={router.pathname.startsWith(item.path) ? 'blue' : 'gray'}
              leftIcon={item.icon}
              onClick={() => router.push(item.path)}>
              {item.name}
            </Button>
          ))}
        </HStack>

        <HStack spacing={2}>
          <IconButton
            aria-label="Toggle color mode"
            icon={colorMode === 'light' ? <FiMoon size={16} /> : <FiSun size={16} />}
            size="sm"
            variant="ghost"
            onClick={toggleColorMode}
          />
          <Button
            size="sm"
            variant="ghost"
            colorScheme="red"
            leftIcon={<FaSignOutAlt />}
            onClick={handleLogout}>
            Logout
          </Button>
        </HStack>
      </Flex>

      <Box p={8}>
        {children}
      </Box>
    </Box>
  );
}
