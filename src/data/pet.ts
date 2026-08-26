import type { MotionPreset, PetProfile } from '../types/pet'

export const PET_SIZE = {
  width: 174,
  height: 218,
} as const

export const DEFAULT_PET_PROFILE: PetProfile = {
  name: '桌宠',
  personality: 'friendly',
  motionStyle: 'light',
}

export const motionPresets: Record<string, MotionPreset> = {
  light: {
    idleDurationMs: 2700,
    idleAmplitudePx: 3,
    walkDurationMs: 1500,
    autoWalkDelayMs: 5600,
  },
  steady: {
    idleDurationMs: 3600,
    idleAmplitudePx: 2,
    walkDurationMs: 2200,
    autoWalkDelayMs: 6800,
  },
  cute: {
    idleDurationMs: 2300,
    idleAmplitudePx: 4,
    walkDurationMs: 1800,
    autoWalkDelayMs: 5200,
  },
  robotic: {
    idleDurationMs: 1900,
    idleAmplitudePx: 1,
    walkDurationMs: 1700,
    autoWalkDelayMs: 6200,
  },
}

export const personalityLabels: Record<string, string> = {
  calm: '专业冷静',
  friendly: '活泼友好',
  direct: '高效直接',
  funny: '幽默轻松',
}

export const motionStyleLabels: Record<string, string> = {
  light: '轻快',
  steady: '稳重',
  cute: '软萌',
  robotic: '机械',
}

export const personalityWelcome: Record<string, (name: string) => string> = {
  calm: (name) => `我是${name}，已经准备好了。告诉我你想完成什么。`,
  friendly: (name) => `嗨，我是${name}！今天想让我陪你完成什么？`,
  direct: (name) => `我是${name}。任务交给我，你想先做什么？`,
  funny: (name) => `嗨，我是${name}。今天又有什么任务要一起搞定？`,
}
