import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  Heading,
  Button,
  Tag,
  HStack,
  IconButton,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  Flex,
  Tooltip,
  Skeleton,
  Input,
} from '@chakra-ui/react';
import moment from 'moment';
import { useEffect, useRef, useState } from 'react';
import { SlRefresh } from 'react-icons/sl';

import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import { showToast } from '../components/toast';

interface Release {
  id: string;
  path: string;
  runtimeVersion: string;
  channel: string;
  timestamp: string;
  size: number;
  commitHash: string | null;
  commitMessage: string | null;
  canaryPercentage: number;
}

export default function ReleasesPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [editingReleaseId, setEditingReleaseId] = useState<string | null>(null);
  const [editingPercentage, setEditingPercentage] = useState<string>('');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchReleases();
  }, []);

  const saveCanaryPercentage = async (releaseId: string) => {
    const pct = parseInt(editingPercentage, 10);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      showToast('Percentage must be 0–100', 'error');
      return;
    }
    setSavingId(releaseId);
    try {
      const response = await fetch(`/api/releases/${releaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canaryPercentage: pct }),
      });
      if (!response.ok) throw new Error('Failed to update');
      await fetchReleases();
      setEditingReleaseId(null);
      showToast('Rollout updated', 'success');
    } catch {
      showToast('Failed to update rollout', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const fetchReleases = async () => {
    try {
      const response = await fetch('/api/releases');
      if (!response.ok) {
        throw new Error('Failed to fetch releases');
      }
      const data = await response.json();
      setReleases(data.releases);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch releases');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <Box mx={4}>
          <Flex className="flex-col">
            <HStack>
              <Heading size="lg">Releases</Heading>
              <IconButton
                aria-label="Refresh"
                onClick={fetchReleases}
                variant="solid"
                // colorScheme="blue"
                size="md"
                icon={<SlRefresh />}
              />
            </HStack>

            {loading ? (
              <Skeleton height="200px" borderRadius="md" />
            ) : error ? (
              <Text color="red.500">{error}</Text>
            ) : (
              <Table variant="simple">
                <Thead>
                  <Tr>
                    <Th>Name</Th>
                    <Th>Channel</Th>
                    <Th>Runtime Version</Th>
                    <Th>Commit Hash</Th>
                    <Th>Commit Message</Th>
                    <Th>Timestamp (UTC)</Th>
                    <Th>File Size</Th>
                    <Th>Rollout</Th>
                    <Th>Edit Rollout</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {releases
                    .sort(
                      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    )
                    .map((release, index) => (
                      <Tr key={release.path}>
                        <Td>{release.path}</Td>
                        <Td>
                          <Tag
                            colorScheme={
                              release.channel === 'production'
                                ? 'blue'
                                : release.channel === 'staging'
                                ? 'purple'
                                : 'gray'
                            }>
                            {release.channel ?? 'production'}
                          </Tag>
                        </Td>
                        <Td>{release.runtimeVersion}</Td>
                        <Td>
                          <Tooltip label={release.commitHash}>
                            <Text isTruncated w="10rem">
                              {release.commitHash}
                            </Text>
                          </Tooltip>
                        </Td>
                        <Td>
                          <Tooltip label={release.commitMessage}>
                            <Text isTruncated w="10rem">
                              {release.commitMessage}
                            </Text>
                          </Tooltip>
                        </Td>
                        <Td className="min-w-[14rem]">
                          {moment(release.timestamp).utc().format('MMM, Do  HH:mm')}
                        </Td>
                        <Td>{formatFileSize(release.size)}</Td>
                        <Td>
                          <Tag
                            colorScheme={release.canaryPercentage < 100 ? 'orange' : 'green'}
                            borderRadius="full"
                            size="sm"
                          >
                            {release.canaryPercentage < 100 ? `🐤 ${release.canaryPercentage}%` : `✓ 100%`}
                          </Tag>
                        </Td>
                        <Td>
                          {editingReleaseId === release.id ? (
                            <HStack spacing={1}>
                              <Input
                                size="xs"
                                w="60px"
                                value={editingPercentage}
                                onChange={(e) => setEditingPercentage(e.target.value)}
                                type="number"
                                min={0}
                                max={100}
                              />
                              <Button
                                size="xs"
                                colorScheme="blue"
                                isLoading={savingId === release.id}
                                onClick={() => saveCanaryPercentage(release.id)}
                              >
                                Save
                              </Button>
                              <Button size="xs" variant="ghost" onClick={() => setEditingReleaseId(null)}>
                                Cancel
                              </Button>
                            </HStack>
                          ) : (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                setEditingReleaseId(release.id);
                                setEditingPercentage(String(release.canaryPercentage));
                              }}
                            >
                              Edit %
                            </Button>
                          )}
                        </Td>
                        <Td justifyItems="center">
                          {index === 0 ? (
                            <Tag size="lg" colorScheme="green">
                              Active Release
                            </Tag>
                          ) : (
                            <Button
                              variant="solid"
                              colorScheme="orange"
                              size="sm"
                              onClick={async () => {
                                setIsOpen(true);
                                setSelectedRelease(release);
                              }}>
                              <AlertDialog
                                isOpen={isOpen}
                                leastDestructiveRef={cancelRef}
                                onClose={() => setIsOpen(false)}
                                isCentered>
                                <AlertDialogOverlay>
                                  <AlertDialogContent>
                                    <AlertDialogHeader fontSize="lg" fontWeight="bold">
                                      Rollback Release
                                    </AlertDialogHeader>

                                    <AlertDialogBody>
                                      Are you sure you want to rollback to this release?
                                      <Tag
                                        size="lg"
                                        colorScheme="green"
                                        mt={4}
                                        padding={4}
                                        className="w-full">
                                        <Text fontSize="sm">
                                          Commit Hash: {selectedRelease?.commitHash}
                                        </Text>
                                      </Tag>
                                      <Tag size="lg" colorScheme="orange" mt={4} padding={4}>
                                        <Text fontSize="sm">
                                          This will promote this release to be the active release
                                          with a new timestamp.
                                        </Text>
                                      </Tag>
                                    </AlertDialogBody>

                                    <AlertDialogFooter>
                                      <Button ref={cancelRef} onClick={() => setIsOpen(false)}>
                                        Cancel
                                      </Button>
                                      <Button
                                        colorScheme="red"
                                        onClick={async () => {
                                          const response = await fetch('/api/rollback', {
                                            method: 'POST',
                                            headers: {
                                              'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify({
                                              path: selectedRelease?.path,
                                              runtimeVersion: selectedRelease?.runtimeVersion,
                                              channel: selectedRelease?.channel ?? 'production',
                                              commitHash: selectedRelease?.commitHash,
                                              commitMessage: selectedRelease?.commitMessage,
                                            }),
                                          });

                                          if (!response.ok) {
                                            throw new Error('Rollback failed');
                                          }

                                          showToast('Rollback successful', 'success');
                                          fetchReleases();
                                          setIsOpen(false);
                                        }}
                                        ml={3}>
                                        Rollback
                                      </Button>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialogOverlay>
                              </AlertDialog>
                              Rollback to this release
                            </Button>
                          )}
                        </Td>
                      </Tr>
                    ))}
                </Tbody>
              </Table>
            )}
          </Flex>
        </Box>
      </Layout>
    </ProtectedRoute>
  );
}

function formatFileSize(bytes: number | undefined | null): string {
  if (bytes == null) return '-';
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
