'use client';

import { ChakraProvider, extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
  config: {
    initialColorMode: 'system',
    useSystemColorMode: true,
  },
  colors: {
    primary: {
      DEFAULT: '#5655D7',
      100: '#DDDDF7',
      200: '#BBBBEF',
      300: '#9A99E7',
      400: '#7877DF',
      500: '#5655D7',
      600: '#4D4CC1',
      700: '#4948B7',
      800: '#4544AC',
      900: '#4040A1',
    },
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ChakraProvider theme={theme}>{children}</ChakraProvider>;
}
