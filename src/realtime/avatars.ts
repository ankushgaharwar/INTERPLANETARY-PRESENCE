import type { AvatarId } from "./types";

export interface AvatarOption {
  id: AvatarId;
  label: string;
  detail: string;
  skin: number;
  hair: number;
  accent: number;
}

export const AVATARS: AvatarOption[] = [
  {
    id: "atlas",
    label: "Atlas",
    detail: "Warm · short hair",
    skin: 0xc98f6b,
    hair: 0x281d1a,
    accent: 0x4d887c
  },
  {
    id: "nova",
    label: "Nova",
    detail: "Deep · tied hair",
    skin: 0x8f5e43,
    hair: 0x171311,
    accent: 0xc86d5b
  },
  {
    id: "sol",
    label: "Sol",
    detail: "Light · swept hair",
    skin: 0xe0ad8e,
    hair: 0x6b3526,
    accent: 0xd39a45
  }
];

export const AVATAR_BY_ID = AVATARS.reduce(
  (avatars, avatar) => ({ ...avatars, [avatar.id]: avatar }),
  {} as Record<AvatarId, AvatarOption>
);
