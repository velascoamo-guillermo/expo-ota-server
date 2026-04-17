'use client';

import { useState } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  VStack,
  HStack,
  Text,
  Heading,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiZap } from 'react-icons/fi';

export default function Home() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const bgPage = useColorModeValue('gray.50', 'gray.900');
  const bgCard = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error);
      } else {
        localStorage.setItem('isAuthenticated', 'true');
        router.push('/dashboard');
      }
    } catch (err) {
      setError('Failed to login');
      console.error(err);
    }
  };

  return (
    <Box display="flex" minHeight="100vh" alignItems="center" justifyContent="center" bg={bgPage}>
      <VStack spacing={8} w="full" maxW="360px" px={4}>
        <VStack spacing={2}>
          <HStack spacing={2}>
            <Box color="blue.500">
              <FiZap size={28} />
            </Box>
            <Heading size="lg" letterSpacing="tight">
              OTA Server
            </Heading>
          </HStack>
          <Text color="gray.500" fontSize="sm">
            Admin Dashboard
          </Text>
        </VStack>

        <Box w="full" bg={bgCard} borderRadius="xl" borderWidth={1} borderColor={borderColor} p={6}>
          <form onSubmit={handleLogin}>
            <VStack spacing={4}>
              <FormControl isInvalid={!!error}>
                <FormLabel htmlFor="password" srOnly>
                  Password
                </FormLabel>
                <Input
                  id="password"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Admin password"
                  size="md"
                />
                {error && <FormErrorMessage>{error}</FormErrorMessage>}
              </FormControl>
              <Button type="submit" colorScheme="blue" width="full">
                Sign in
              </Button>
            </VStack>
          </form>
        </Box>
      </VStack>
    </Box>
  );
}
