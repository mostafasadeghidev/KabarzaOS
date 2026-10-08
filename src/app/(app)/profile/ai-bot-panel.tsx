'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ExternalLink, LogIn, Plug, RefreshCw, Send, Unplug } from 'lucide-react';
import {
  deleteAiAction, loadModelsAction, moveAiAction, saveAiAction, setModelAction, type AiFormState,
} from './_form/ai-actions';
import type { ModelOption, ProviderId } from '@/domain/ai/providers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { Panel } from '@/components/page-shell';
import { IconButton } from '@/components/ui/icon-button';
import { useT } from '@/i18n/client';

export interface AiProviderOption {
  id: ProviderId;
  label: string;
  keyUrl: string;
  free: boolean;
  defaultModel: string;
}

export interface AiConnectionInfo {
  id: number;
  priority: number;
  provider: ProviderId;
  baseUrl: string;
  model: string;
  keyHint: string;
  updatedAt: string;
}

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? <Spinner /> : <Plug className="size-3.5" />}{children}</Button>;
}

/**
 * یک اتصال در فهرستِ اولویت (۲.۱۲.۰): جابه‌جایی، مدل، قطع.
 * ⚠️ هر کارت state ِ مدلِ خودش را دارد؛ با `key` ِ updatedAt پس از ذخیره تازه می‌شود.
 */
function ConnectionCard({ connection, index, total, label }: {
  connection: AiConnectionInfo;
  index: number;
  total: number;
  label: string;
}) {
  const tr = useT();
  const confirm = useConfirm();
  const { show } = useToast();
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [model, setModel] = useState(connection.model);
  const [pending, startTransition] = useTransition();
  const field = `ai-model-${connection.id}`;

  const loadModels = () => startTransition(async () => {
    const result = await loadModelsAction(connection.id);
    if (result.error) show(tr(result.error), 'error');
    else setModels(result.models ?? []);
  });
  const saveModel = () => startTransition(async () => {
    const result = await setModelAction(connection.id, model);
    show(tr(result.error ?? 'مدل ذخیره شد.'), result.error ? 'error' : 'success');
  });
  const move = (direction: 'up' | 'down') => startTransition(async () => {
    const result = await moveAiAction(connection.id, direction);
    if (result.error) show(tr(result.error), 'error');
  });
  const disconnect = async () => {
    if (!(await confirm({
      title: tr('«{name}» حذف شود؟', { name: label }),
      description: total > 1
        ? tr('کلیدِ ذخیره‌شده پاک می‌شود؛ ربات با بقیهٔ هوشِ مصنوعی‌ها کار می‌کند.')
        : tr('کلیدِ ذخیره‌شده پاک می‌شود و ربات فقط با دکمه‌ها کار می‌کند.'),
    }))) return;
    startTransition(async () => {
      await deleteAiAction(connection.id);
      show(tr('قطع شد.'), 'success');
    });
  };

  return (
    <div className="grid gap-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={index === 0 ? 'success' : 'secondary'}>
          {index === 0 ? tr('اول') : tr('جایگزینِ {n}', { n: index })}
        </Badge>
        <span className="font-medium" dir="ltr">{label}</span>
        {connection.keyHint && <code dir="ltr" className="text-xs text-muted-foreground">{connection.keyHint}</code>}
        {connection.provider === 'custom' && <code dir="ltr" className="text-xs break-all text-muted-foreground">{connection.baseUrl}</code>}
        <span className="ms-auto flex items-center gap-1">
          {total > 1 && (
            <>
              <IconButton variant="ghost" className="size-8" label={tr('اولویتِ بالاتر')} disabled={pending || index === 0} onClick={() => move('up')}>
                <ArrowUp className="size-3.5" />
              </IconButton>
              <IconButton variant="ghost" className="size-8" label={tr('اولویتِ پایین‌تر')} disabled={pending || index === total - 1} onClick={() => move('down')}>
                <ArrowDown className="size-3.5" />
              </IconButton>
            </>
          )}
          <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={disconnect}>
            <Unplug className="size-3.5" />{tr('قطع')}
          </Button>
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field className="min-w-56 flex-1">
          <FieldLabel htmlFor={field}>{tr('مدل')}</FieldLabel>
          {models && models.length > 0 ? (
            <SearchableSelect id={field} value={model} onValueChange={setModel} containerClassName="w-full" aria-label={tr('مدل')}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{`${m.id}${m.free ? ` — ${tr('رایگان')}` : ''}${m.tools === false ? ` (${tr('بی‌ابزار')})` : ''}`}</option>
              ))}
            </SearchableSelect>
          ) : (
            <Input id={field} dir="ltr" value={model} onChange={(e) => setModel(e.target.value)} maxLength={200} />
          )}
        </Field>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={loadModels}>
          {pending ? <Spinner /> : <RefreshCw className="size-3.5" />}{tr('فهرستِ مدل‌ها')}
        </Button>
        <Button type="button" size="sm" disabled={pending || !model || model === connection.model} onClick={saveModel}>
          {tr('ذخیرهٔ مدل')}
        </Button>
      </div>
    </div>
  );
}

/**
 * «ربات تلگرامِ هوشمند» (۲.۹.۰) — هر عضو هوشِ مصنوعیِ **خودش** را به ربات
 * وصل می‌کند: «ورود با OpenRouter» (مدل‌های رایگان، بی‌کلید) یا کلیدِ
 * DeepSeek، ChatGPT، Claude، Z.ai، AgentRouter، Gemini، Groq و هر سرویسِ
 * سازگار با OpenAI. ⚠️ کلید هرگز به مرورگر برنمی‌گردد؛ فقط چهار نویسهٔ آخر.
 */
export function AiBotPanel({ connections, providers, telegram, botUsername }: {
  connections: AiConnectionInfo[];
  providers: AiProviderOption[];
  telegram: 'connected' | 'disconnected' | 'unavailable';
  botUsername: string;
}) {
  const tr = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { show } = useToast();
  const [state, save] = useActionState<AiFormState, FormData>(saveAiAction, {});
  const [provider, setProvider] = useState<ProviderId>(connections.some((c) => c.provider === 'deepseek') ? 'groq' : 'deepseek');

  // نتیجهٔ «ورود با OpenRouter» — یک بار پیام، بعد پاک‌کردنِ پارامتر.
  const shown = useRef(false);
  useEffect(() => {
    const result = params.get('ai');
    if (!result || shown.current) return;
    shown.current = true;
    show(tr(result === 'connected' ? 'OpenRouter وصل شد.' : 'اتصال به OpenRouter انجام نشد.'), result === 'connected' ? 'success' : 'error');
    router.replace('/profile?tab=mcp', { scroll: false });
  }, [params, router, show, tr]);

  useEffect(() => {
    if (state.saved) show(tr('هوشِ مصنوعی وصل شد.'), 'success');
  }, [state, show, tr]);

  const preset = providers.find((p) => p.id === provider);
  const labelOf = (c: AiConnectionInfo) => providers.find((p) => p.id === c.provider)?.label ?? c.provider;
  const hasOpenRouter = connections.some((c) => c.provider === 'openrouter');
  const sameProvider = connections.some((c) => c.provider === provider && provider !== 'custom');
  // ⚠️ کلیدِ فرم: پس از هر ذخیره/حذف فرم خالی می‌شود (تلهٔ reset ِ فرم).
  const formKey = connections.map((c) => `${c.id}:${c.updatedAt}`).join('|') || 'new';

  return (
    <Panel title={tr('ربات تلگرامِ هوشمند')}>
      <p className="text-sm text-muted-foreground">
        {tr('در تلگرام با ربات حرف بزنید: «امروز چه تسکی دارم؟»، «۲ ساعت روی پروژهٔ آلفا ثبت کن». ربات با دکمه‌ها همیشه کار می‌کند؛ برای فهمیدنِ متنِ آزاد، هوشِ مصنوعیِ خودتان را وصل کنید — هزینه یا سهمیهٔ رایگانش مالِ حسابِ خودتان است. هر کارِ نوشتنی پیش از انجام با دکمهٔ «بله/خیر» از شما تأیید می‌گیرد.')}
      </p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Send className="size-4 text-muted-foreground" aria-hidden />
        {telegram === 'connected' ? (
          <>
            <Badge variant="success">{tr('تلگرام وصل است')}</Badge>
            {botUsername && (
              <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline" dir="ltr">
                @{botUsername}<ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </>
        ) : telegram === 'unavailable' ? (
          <Badge variant="secondary">{tr('ربات تلگرام هنوز راه‌اندازی نشده (تنظیمات ← تلگرام).')}</Badge>
        ) : (
          <a href="/profile?tab=notify" className="text-primary hover:underline">{tr('اول تلگرامتان را وصل کنید')}</a>
        )}
      </div>

      {connections.length > 0 && (
        <div className="grid gap-2">
          {connections.length > 1 && (
            <p className="text-xs text-muted-foreground">
              {tr('ربات اول سراغِ بالایی می‌رود؛ اگر سهمیه‌اش تمام شد، کلیدش کار نکرد یا جواب نداد، همان درخواست را به بعدی می‌دهد. ویس با اولین اتصالی که صدا می‌فهمد (Groq یا OpenAI) تبدیل می‌شود.')}
            </p>
          )}
          {connections.map((c, i) => (
            <ConnectionCard key={`${c.id}:${c.updatedAt}:${c.model}`} connection={c} index={i} total={connections.length} label={labelOf(c)} />
          ))}
        </div>
      )}

      <div className="grid gap-2 rounded-xl border bg-card p-3">
        <h4 className="text-sm font-semibold">{tr('ورود با OpenRouter — رایگان، بی‌کلید')}</h4>
        <p className="text-xs text-muted-foreground">
          {tr('با حسابِ OpenRouter ِ خودتان وارد شوید؛ کلید خودکار ساخته و اینجا رمزگذاری‌شده نگه داشته می‌شود. پیش‌فرض یک مدلِ رایگان است.')}
        </p>
        <div>
          <Button asChild size="sm" variant={hasOpenRouter ? 'outline' : 'default'}>
            <a href="/api/ai/openrouter/start"><LogIn className="size-3.5" />{hasOpenRouter ? tr('ورودِ دوباره با OpenRouter') : tr('ورود با OpenRouter')}</a>
          </Button>
        </div>
      </div>

      <form key={formKey} action={save} className="grid gap-3 rounded-xl border bg-card p-3">
        <h4 className="text-sm font-semibold">{connections.length > 0 ? tr('افزودنِ هوشِ مصنوعیِ دیگر (جایگزین)') : tr('یا با کلیدِ API ِ خودتان')}</h4>
        <div className="flex flex-wrap items-end gap-2">
          <Field className="w-56">
            <FieldLabel htmlFor="ai-provider">{tr('ارائه‌دهنده')}</FieldLabel>
            <NativeSelect
              id="ai-provider" name="provider" value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderId)} containerClassName="w-full"
            >
              {providers.filter((p) => p.id !== 'openrouter').map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.id === 'custom' ? tr('سرویسِ دلخواه (سازگار با OpenAI)') : p.label}{p.free ? ` — ${tr('سهمیهٔ رایگان')}` : ''}
                </NativeSelectOption>
              ))}
              <NativeSelectOption value="openrouter">OpenRouter</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field className="min-w-56 flex-1">
            <FieldLabel htmlFor="ai-key">{tr('کلیدِ API')}</FieldLabel>
            <Input
              id="ai-key" name="apiKey" type="password" dir="ltr" autoComplete="off" maxLength={500}
              placeholder={sameProvider ? tr('خالی = همان کلیدِ قبلی') : ''}
            />
          </Field>
        </div>
        {provider === 'custom' && (
          <Field>
            <FieldLabel htmlFor="ai-url">{tr('نشانیِ پایهٔ API')}</FieldLabel>
            <Input id="ai-url" name="baseUrl" dir="ltr" placeholder="https://api.example.com/v1" required />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="ai-model-new">{tr('مدل (اختیاری)')}</FieldLabel>
          <Input id="ai-model-new" name="model" dir="ltr" maxLength={200} placeholder={preset?.defaultModel || tr('خالی = انتخابِ خودکار')} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Submit>{tr('وصل‌کردن')}</Submit>
          {preset?.keyUrl && (
            <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              {tr('گرفتنِ کلید از {name}', { name: preset.label })}<ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
        {state.error && <p className="text-sm text-destructive">{tr(state.error)}</p>}
        <FieldDescription>
          {tr('کلید رمزگذاری‌شده ذخیره می‌شود و دیگر نمایش داده نمی‌شود. فقط ربات و فقط برای پیام‌های خودتان از آن استفاده می‌کند.')}
        </FieldDescription>
      </form>
    </Panel>
  );
}
