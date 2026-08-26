import { ArrowRight, CheckCircle2, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { Brand } from '../components/Brand/Brand'

type LoginPageProps = {
  onContinue: () => void
}

export function LoginPage({ onContinue }: LoginPageProps) {
  return (
    <main className="login-page">
      <div className="login-page__glow login-page__glow--one" />
      <div className="login-page__glow login-page__glow--two" />

      <section className="login-shell">
        <div className="login-intro">
          <Brand />
          <div className="login-intro__copy">
            <span className="pill">
              <Sparkles size={14} />
              你的 AI 办公伙伴
            </span>
            <h1>
              让每一项工作，
              <span>都有人帮你推进。</span>
            </h1>
            <p>TaskPet 是常驻工作台的 AI 桌宠。说出目标，它会陪你把复杂任务一步步完成。</p>
          </div>

          <div className="login-benefits" aria-label="产品特点">
            <span><CheckCircle2 size={17} />理解你的工作目标</span>
            <span><CheckCircle2 size={17} />清晰展示执行过程</span>
            <span><CheckCircle2 size={17} />随时等待你的确认</span>
          </div>

          <div className="mini-pet" aria-hidden="true">
            <span className="mini-pet__spark">✦</span>
            <span className="mini-pet__face">•ᴗ•</span>
            <span className="mini-pet__message">今天想完成什么？</span>
          </div>
        </div>

        <div className="login-panel">
          <div className="login-panel__heading">
            <span className="login-panel__icon" aria-hidden="true">
              <ShieldCheck size={22} />
            </span>
            <div>
              <h2>欢迎体验 TaskPet</h2>
              <p>无需注册，立即创建你的专属桌宠</p>
            </div>
          </div>

          <label className="field-label" htmlFor="mock-email">工作邮箱 <span>选填</span></label>
          <div className="input-shell">
            <Mail size={18} aria-hidden="true" />
            <input id="mock-email" type="email" placeholder="name@company.com" autoComplete="email" />
          </div>

          <button className="primary-button primary-button--large" type="button" onClick={onContinue}>
            <span>开始体验</span>
            <ArrowRight size={19} />
          </button>

          <p className="login-panel__notice">本 Demo 使用模拟登录，不会保存或上传账号信息。</p>

          <div className="login-panel__divider"><span>3 分钟了解全新工作方式</span></div>
          <div className="login-panel__steps">
            <span><b>1</b>创建桌宠</span>
            <i />
            <span><b>2</b>进入工作台</span>
            <i />
            <span><b>3</b>交付任务</span>
          </div>
        </div>
      </section>

      <footer className="login-footer">TaskPet Demo · 让 AI 协作看得见</footer>
    </main>
  )
}
