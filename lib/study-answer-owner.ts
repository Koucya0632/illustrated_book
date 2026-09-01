/**
 * Immediate answers predate owner tags and remain valid. Durable replays carry
 * the UUID that queued them and must match the authenticated account.
 */
export function studyAnswerOwnerMatches(ownerUserId: unknown, authenticatedUserId: string): boolean {
  return (
    ownerUserId === undefined ||
    (typeof ownerUserId === "string" &&
      ownerUserId.toLowerCase() === authenticatedUserId.toLowerCase())
  );
}
