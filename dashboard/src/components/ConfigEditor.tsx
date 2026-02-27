import React, { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { yaml as yamlLang } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import yaml from 'js-yaml';
import type { SwarmState } from '../types.ts';

interface ConfigEditorProps {
  swarmState: SwarmState;
  onSave: (yamlStr: string) => void;
  saveFeedback: { ok: boolean; error: string | null } | null;
}

export function ConfigEditor({
  swarmState,
  onSave,
  saveFeedback,
}: ConfigEditorProps): React.ReactElement {
  const [yamlStr, setYamlStr] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg: unknown) => {
        setYamlStr(yaml.dump(cfg, { lineWidth: 120 }));
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!saveFeedback) return;

    setSaving(false);

    if (saveFeedback.ok) {
      setError(null);
      setSaved(true);
      void fetch('/api/config')
        .then((r) => r.json())
        .then((cfg: unknown) => setYamlStr(yaml.dump(cfg, { lineWidth: 120 })))
        .catch((e: unknown) => setError(String(e)));
      const timer = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(timer);
    }

    setSaved(false);
    setError(saveFeedback.error ?? 'Config save failed');
    return undefined;
  }, [saveFeedback]);

  const isLocked = swarmState !== 'idle';

  function handleSaveClick(): void {
    if (isLocked) return;
    setPendingSave(true);
  }

  function handleConfirmSave(): void {
    setPendingSave(false);
    setError(null);
    setSaved(false);
    setSaving(true);
    onSave(yamlStr);
  }

  function handleCancelSave(): void {
    setPendingSave(false);
  }

  return (
    <div className="panel">
      <div
        className="flex-row gap-3"
        style={{ marginBottom: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}
      >
        <span className="panel-title" style={{ margin: 0 }}>Config Editor</span>
        {isLocked && (
          <span className="state-chip chip-error" style={{ fontSize: 10 }}>
            Locked while swarm is {swarmState}
          </span>
        )}
        {pendingSave ? (
          <div className="flex-row gap-3" style={{ marginLeft: 'auto', alignItems: 'center' }}>
            <span className="text-sm" style={{ color: 'var(--color-soft-gold)' }}>
              Save config to disk?
            </span>
            <button className="btn btn-save" onClick={handleConfirmSave}>
              Confirm
            </button>
            <button className="btn" onClick={handleCancelSave}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="btn btn-save"
            style={{ marginLeft: 'auto' }}
            onClick={handleSaveClick}
            disabled={isLocked || saving}
          >
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Config'}
          </button>
        )}
      </div>

      {error && (
        <div style={{ color: 'var(--color-error)', marginBottom: 'var(--space-3)', fontSize: 12 }}>
          Error loading config: {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm">Loading config...</div>
      ) : (
        <CodeMirror
          value={yamlStr}
          height="500px"
          theme={oneDark}
          extensions={[yamlLang()]}
          editable={!isLocked}
          onChange={(val) => setYamlStr(val)}
        />
      )}
    </div>
  );
}
