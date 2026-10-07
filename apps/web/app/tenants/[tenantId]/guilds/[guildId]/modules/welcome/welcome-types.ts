export interface LiveDiscordChannel {
  id: string;
  name: string;
  type?: number;
  position?: number;
}

export interface LiveDiscordRole {
  id: string;
  name: string;
  color: string;
  position?: number;
}

export type CanvasLayerType = "avatar" | "text";

export interface CanvasLayer {
  id: string;
  type: CanvasLayerType;
  label: string;
  x: number;
  y: number;
  // Text layer fields
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
  // Avatar layer fields
  size?: number;
  shape?: "circle" | "squircle";
  borderColor?: string;
  borderWidth?: number;
}

export interface BannerAvatarConfig {
  enabled: boolean;
  size: number;
  rounded: "full" | "lg";
  borderColor: string;
  borderWidth: number;
  x: number;
  y: number;
}

export interface BannerHeadingConfig {
  enabled: boolean;
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  x: number;
  y: number;
}

export interface BannerSubtextConfig {
  enabled: boolean;
  text: string;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  x: number;
  y: number;
}

export interface WelcomeBannerConfig {
  bgType: "gradient" | "image";
  bgGradient: string;
  bgImageUrl: string | null;
  bgImageFit?: "cover" | "contain" | "fill";
  bgImagePosition?: "center" | "top" | "bottom";
  overlayOpacity: number;
  layers: CanvasLayer[];
  customGradientStart?: string;
  customGradientEnd?: string;
  customGradientMiddle?: string;
  gradientAngle?: number;
  useMiddleColor?: boolean;
  // Legacy fields kept optional for backward compatibility
  avatar?: BannerAvatarConfig;
  heading?: BannerHeadingConfig;
  subtext?: BannerSubtextConfig;
}

export interface WelcomeConfig {
  enabled: boolean;
  channelId: string;
  channelName: string;
  message: string;
  pingUser: boolean;
  sendDm: boolean;
  ignoreBots: boolean;
  autoRoleEnabled: boolean;
  autoRoleId: string;
  autoRoleName: string;
  customCanvasCard: boolean;
  rulesGate: boolean;
  bannerConfig: WelcomeBannerConfig;
}

export const DEFAULT_BANNER_LAYERS: CanvasLayer[] = [
  {
    id: "layer-avatar",
    type: "avatar",
    label: "Member Avatar",
    x: 0,
    y: -35,
    size: 84,
    shape: "circle",
    borderColor: "#5865F2",
    borderWidth: 3,
  },
  {
    id: "layer-heading",
    type: "text",
    label: "Welcome Heading",
    text: "WELCOME TO THE SERVER",
    fontFamily: "Inter",
    fontSize: 26,
    color: "#FFFFFF",
    align: "center",
    x: 0,
    y: 30,
  },
  {
    id: "layer-subtext",
    type: "text",
    label: "Member Subtext",
    text: "{user.name} is member #{memberCount}",
    fontFamily: "Inter",
    fontSize: 14,
    color: "#94A3B8",
    align: "center",
    x: 0,
    y: 65,
  },
];

export const DEFAULT_WELCOME_CONFIG: WelcomeConfig = {
  enabled: true,
  channelId: "c-welcome",
  channelName: "#welcome-and-rules",
  message: "Welcome to **{server}**, {user}! You are our **#{memberCount}** member. Check out #rules to get started! 🚀",
  pingUser: true,
  sendDm: false,
  ignoreBots: false,
  autoRoleEnabled: true,
  autoRoleId: "r-member",
  autoRoleName: "@Community Member",
  customCanvasCard: true,
  rulesGate: false,
  bannerConfig: {
    bgType: "gradient",
    bgGradient: "from-slate-900 via-indigo-950 to-slate-950",
    bgImageUrl: null,
    overlayOpacity: 0,
    layers: DEFAULT_BANNER_LAYERS,
  },
};
