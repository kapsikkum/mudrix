import { Component, type ReactNode, type ErrorInfo } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoLoader } from '@/app/components/AppLoading/LogoLoader';
import { getErrorMessage } from '@/util/error';
import * as css from './ErrorBoundary.css';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: string | null;
}

function ErrorFallback({ error }: { error: string }): ReactNode {
  const { t } = useTranslation();
  return (
    <div className={css.overlay}>
      <LogoLoader />
      <div className={css.errorBox}>
        <h2 className={css.heading}>{t('common.somethingWentWrong')}</h2>
        <pre className={css.message}>{error}</pre>
        <button type="button" className={css.refreshBtn} onClick={() => window.location.reload()}>
          {t('common.refresh')}
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error: getErrorMessage(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback ?? <ErrorFallback error={this.state.error} />;
    }
    return <>{this.props.children}</>;
  }
}
