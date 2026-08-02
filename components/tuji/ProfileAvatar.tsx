import Mascot from "./Mascot";
import { DEFAULT_AVATAR, isAvatarImage } from "@/lib/avatars";

export default function ProfileAvatar({
  avatar,
  size,
  className = "",
}: {
  avatar: string | null | undefined;
  size: number;
  className?: string;
}) {
  if (isAvatarImage(avatar)) {
    // The URL is constrained to our public avatar bucket by the profile API.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt="" width={size} height={size} className={`object-cover ${className}`} />;
  }
  return <Mascot pose={DEFAULT_AVATAR} size={size} />;
}
