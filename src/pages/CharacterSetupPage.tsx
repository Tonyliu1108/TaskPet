import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Info,
  ScanSearch,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Brand } from '../components/Brand/Brand'
import { CharacterPreview } from '../components/CharacterSetup/CharacterPreview'
import { PhotoUploadPanel } from '../components/CharacterSetup/PhotoUploadPanel'
import '../components/CharacterSetup/CharacterSetup.css'
import { OptionGroup } from '../components/CharacterCreator/OptionGroup'
import {
  CharacterGenerationClientError,
  useCharacterGeneration,
} from '../hooks/useCharacterGeneration'
import { usePersonDetection } from '../hooks/usePersonDetection'
import type { CharacterOption } from '../types/app'
import type {
  CharacterGenerationResult,
  CharacterSetupError,
  CharacterSetupSession,
  CharacterSetupStage,
  DetectedPersonBox,
} from '../types/character'
import type { PetProfile } from '../types/pet'
import { cropDetectedPerson, normalizeSourcePhoto } from '../utils/characterImage'

type CharacterSetupPageProps = {
  onBack: () => void
  onContinue: (profile: PetProfile) => void
}

const SETUP_SESSION_KEY = 'taskpet.demo.characterSetup'

const personalities: CharacterOption[] = [
  { id: 'calm', label: '专业冷静', description: '理性、可靠、有条理' },
  { id: 'friendly', label: '活泼友好', description: '热情、主动、有亲和力' },
  { id: 'direct', label: '高效直接', description: '简洁、果断、重视结果' },
  { id: 'funny', label: '幽默轻松', description: '有趣、松弛、带来好心情' },
]

const motionStyles: CharacterOption[] = [
  { id: 'light', label: '轻快', description: '步伐轻盈' },
  { id: 'steady', label: '稳重', description: '动作从容' },
  { id: 'cute', label: '软萌', description: '可爱治愈' },
  { id: 'robotic', label: '机械', description: '科技感十足' },
]

const DEFAULT_SESSION: CharacterSetupSession = {
  stage: 'idle',
  fileName: '',
  people: [],
  petName: '桌宠',
  personality: 'friendly',
  motionStyle: 'light',
}

function restoreSetupSession(): CharacterSetupSession {
  if (typeof window === 'undefined') return DEFAULT_SESSION
  try {
    const value = window.sessionStorage.getItem(SETUP_SESSION_KEY)
    if (!value) return DEFAULT_SESSION
    const parsed = JSON.parse(value) as Partial<CharacterSetupSession>
    if (
      !Array.isArray(parsed.people) ||
      typeof parsed.petName !== 'string' ||
      typeof parsed.personality !== 'string' ||
      typeof parsed.motionStyle !== 'string'
    ) return DEFAULT_SESSION

    const restoredStage: CharacterSetupStage = parsed.stage === 'generated' && parsed.result
      ? 'generated'
      : parsed.sourcePhoto && parsed.selectedPersonId && parsed.croppedPersonImage
        ? 'ready_to_generate'
        : parsed.sourcePhoto && parsed.people.length > 1
          ? 'multiple_detected'
          : 'idle'

    return {
      ...DEFAULT_SESSION,
      ...parsed,
      stage: restoredStage,
      people: parsed.people,
      error: undefined,
    }
  } catch {
    return DEFAULT_SESSION
  }
}

function isAcceptedImage(file: File) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 12 * 1024 * 1024
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('无法读取图片'))
    reader.onerror = () => reject(new Error('无法读取图片'))
    reader.readAsDataURL(file)
  })
}

export function CharacterSetupPage({ onBack, onContinue }: CharacterSetupPageProps) {
  const restored = useMemo(restoreSetupSession, [])
  const [stage, setStage] = useState<CharacterSetupStage>(restored.stage)
  const [fileName, setFileName] = useState(restored.fileName)
  const [sourcePhoto, setSourcePhoto] = useState(restored.sourcePhoto)
  const [people, setPeople] = useState<DetectedPersonBox[]>(restored.people)
  const [selectedPersonId, setSelectedPersonId] = useState(restored.selectedPersonId)
  const [croppedPersonImage, setCroppedPersonImage] = useState(restored.croppedPersonImage)
  const [result, setResult] = useState<CharacterGenerationResult | undefined>(restored.result)
  const [error, setError] = useState<CharacterSetupError | undefined>(restored.error)
  const [petName, setPetName] = useState(restored.petName)
  const [personality, setPersonality] = useState(restored.personality)
  const [motionStyle, setMotionStyle] = useState(restored.motionStyle)
  const fileInputResetRef = useRef(0)
  const { detectPersons, isModelLoading } = usePersonDetection()
  const { generateCharacter, isGenerating } = useCharacterGeneration()

  useEffect(() => {
    const setupSession: CharacterSetupSession = {
      stage,
      fileName,
      sourcePhoto,
      people,
      selectedPersonId,
      croppedPersonImage,
      result,
      error,
      petName,
      personality,
      motionStyle,
    }
    try {
      window.sessionStorage.setItem(SETUP_SESSION_KEY, JSON.stringify(setupSession))
    } catch {
      // Large photos can exceed a browser's quota. The active in-memory flow still works.
    }
  }, [croppedPersonImage, error, fileName, motionStyle, people, personality, petName, result, selectedPersonId, sourcePhoto, stage])

  const applySelection = async (person: DetectedPersonBox, photo = sourcePhoto) => {
    if (!photo) return
    setSelectedPersonId(person.id)
    setCroppedPersonImage(await cropDetectedPerson(photo, person))
    setError(undefined)
    setStage('ready_to_generate')
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!isAcceptedImage(file)) {
      setError({
        code: 'invalid_file',
        message: '请选择 12 MB 以内的 JPG、PNG 或 WebP 图片',
        retryable: false,
      })
      setStage('error')
      return
    }

    setStage('detecting')
    setError(undefined)
    setResult(undefined)
    setPeople([])
    setSelectedPersonId(undefined)
    setCroppedPersonImage(undefined)
    setFileName(file.name)

    try {
      const rawPhoto = await readFileAsDataUrl(file)
      const normalizedPhoto = await normalizeSourcePhoto(rawPhoto)
      setSourcePhoto(normalizedPhoto)
      const detections = await detectPersons(normalizedPhoto)
      setPeople(detections)

      if (detections.length === 0) {
        setError({
          code: 'no_person',
          message: '暂时没有识别到清晰人物，请换一张照片再试',
          retryable: false,
        })
        setStage('error')
        return
      }
      if (detections.length === 1) {
        await applySelection(detections[0], normalizedPhoto)
        return
      }
      setStage('multiple_detected')
    } catch (error) {
      const modelMissing = error instanceof Error && error.message.includes('python scripts/download_models.py')
      setError({
        code: 'detection_failed',
        message: modelMissing ? error.message : '人物识别没有完成，请更换照片或刷新后重试',
        retryable: !modelMissing,
      })
      setStage('error')
    }
  }

  const handleGenerate = async () => {
    if (!sourcePhoto || !croppedPersonImage) return
    setStage('generating')
    setError(undefined)
    try {
      const response = await generateCharacter({
        imageBase64: croppedPersonImage,
        petName: petName.trim() || '桌宠',
        personality,
        motionStyle,
      })
      setResult({
        characterId: response.characterId,
        sourceImage: sourcePhoto,
        croppedPersonImage,
        baseImage: response.baseImage,
        transparentImage: response.transparentImage,
        normalizedImage: response.normalizedImage,
        modelName: response.modelName,
        promptVersion: response.promptVersion,
        createdAt: response.createdAt,
      })
      setStage('generated')
    } catch (generationError) {
      setError(generationError instanceof CharacterGenerationClientError
        ? generationError.setupError
        : {
            code: 'generation_failed',
            message: '生成卡通形象失败，请稍后重试',
            retryable: true,
          })
      setStage('error')
    }
  }

  const resetPhoto = () => {
    fileInputResetRef.current += 1
    setStage('idle')
    setFileName('')
    setSourcePhoto(undefined)
    setPeople([])
    setSelectedPersonId(undefined)
    setCroppedPersonImage(undefined)
    setResult(undefined)
    setError(undefined)
  }

  const handleUseCharacter = () => {
    if (!result) return
    const profile: PetProfile = {
      name: petName.trim() || '桌宠',
      personality,
      motionStyle,
      sourcePhoto: result.sourceImage,
      characterResult: result,
    }
    try {
      window.sessionStorage.removeItem(SETUP_SESSION_KEY)
    } catch {
      // Continue with the confirmed in-memory profile.
    }
    onContinue(profile)
  }

  const selectedPerson = people.find((person) => person.id === selectedPersonId)
  const canGenerate = Boolean(sourcePhoto && croppedPersonImage && selectedPerson)

  const statusContent = (() => {
    if (stage === 'detecting') return { tone: '', icon: 'spinner', title: '正在识别照片中的人物…', copy: '首次使用会加载本地人物检测模型' }
    if (stage === 'multiple_detected') return { tone: '', icon: 'scan', title: `已识别到 ${people.length} 位人物`, copy: '请点击照片中的人物框，选择你想创建为桌宠的人物' }
    if (stage === 'ready_to_generate') return { tone: 'success', icon: 'check', title: `已识别到 ${people.length} 位人物`, copy: people.length === 1 ? '已自动选中，可以开始生成' : '人物已选中，可以开始生成' }
    if (stage === 'generating') return { tone: '', icon: 'spinner', title: '正在生成你的专属卡通形象…', copy: '正在生成主形象、去除背景并整理标准角色资产' }
    if (stage === 'generated') return { tone: 'success', icon: 'check', title: '透明角色资产已准备好', copy: '确认后即可带着这个形象进入工作台' }
    if (stage === 'error' && error) return { tone: 'error', icon: 'error', title: error.message, copy: error.retryable ? '你可以重试生成，或更换一张照片' : '请更换照片后再试' }
    return null
  })()

  return (
    <main className="setup-page">
      <header className="setup-header">
        <Brand compact />
        <div className="setup-progress" aria-label="创建进度：第 2 步，共 3 步">
          <span className="setup-progress__item setup-progress__item--done"><b>1</b>开始</span>
          <i />
          <span className="setup-progress__item setup-progress__item--active"><b>2</b>创建桌宠</span>
          <i />
          <span className="setup-progress__item"><b>3</b>工作台</span>
        </div>
        <button className="text-button" type="button" onClick={onBack}>
          <ArrowLeft size={16} />返回
        </button>
      </header>

      <div className={`setup-main ${stage === 'generated' ? 'setup-main--generated' : ''}`}>
        {stage === 'generated' && result ? (
          <CharacterPreview
            result={result}
            onUse={handleUseCharacter}
            onRegenerate={handleGenerate}
            onReplace={resetPhoto}
            isGenerating={isGenerating}
          />
        ) : (
          <section className="setup-intro">
            <span className="pill"><Sparkles size={14} />真实人物识别</span>
            <h1>创建你的 AI 桌宠</h1>
            <p>上传一张普通生活照。识别在浏览器本地完成，只有你选中的人物裁剪图会在生成时发送到豆包 / 火山方舟。</p>

            <PhotoUploadPanel
              key={fileInputResetRef.current}
              stage={stage}
              fileName={fileName}
              sourcePhoto={sourcePhoto}
              people={people}
              selectedPersonId={selectedPersonId}
              onFileChange={handleFileChange}
              onSelectPerson={applySelection}
            />

            {statusContent && (
              <div className={`setup-flow-status setup-flow-status--${statusContent.tone}`} role={statusContent.tone === 'error' ? 'alert' : 'status'}>
                {statusContent.icon === 'spinner' && <span className="setup-flow-status__spinner" aria-hidden="true" />}
                {statusContent.icon === 'scan' && <ScanSearch size={18} />}
                {statusContent.icon === 'check' && <CheckCircle2 size={18} />}
                {statusContent.icon === 'error' && <AlertCircle size={18} />}
                <div><strong>{statusContent.title}</strong><span>{statusContent.copy}</span></div>
              </div>
            )}

            <div className="privacy-note">
              <Info size={16} />
              <span>API Key 只保存在 FastAPI 后端环境变量中，React 前端不会接触密钥。</span>
            </div>
          </section>
        )}

        <section className="setup-form-card" aria-labelledby="setup-form-title">
          <div className="setup-form-card__heading">
            <span id="setup-form-title">个性设置</span>
            <small>会轻量影响生成姿态</small>
          </div>

          <div className="form-field">
            <label className="field-label" htmlFor="pet-name">桌宠名字</label>
            <div className="name-input">
              <span aria-hidden="true">Aa</span>
              <input
                id="pet-name"
                value={petName}
                maxLength={12}
                onChange={(event) => setPetName(event.target.value)}
                placeholder="给桌宠取个名字"
              />
              <small>{petName.length}/12</small>
            </div>
          </div>

          <OptionGroup legend="选择性格" name="personality" options={personalities} value={personality} onChange={setPersonality} />
          <OptionGroup legend="动作风格" name="motion-style" options={motionStyles} value={motionStyle} onChange={setMotionStyle} />

          {stage === 'generated' ? (
            <p className="setup-submit-note">确认后将保存到这台浏览器的角色库，不会自动生成专属动作包。</p>
          ) : (
            <>
              <button
                className="primary-button setup-submit"
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate || stage === 'generating' || isModelLoading || isGenerating}
              >
                <Sparkles size={18} />
                <span>{stage === 'generating' || isGenerating ? '正在生成卡通形象…' : '生成我的桌宠'}</span>
                <ArrowRight size={18} />
              </button>
              {stage === 'error' && error?.retryable && canGenerate && (
                <button className="text-button setup-retry" type="button" onClick={handleGenerate}>重试生成</button>
              )}
              <p className="setup-submit-note">请先上传并选择人物；每次只生成一个 baseImage。</p>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
