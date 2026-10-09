import React from 'react';
import { LanguageEmblem } from '@/ui/primitives/LanguageEmblem';
import { GenericSection, type SectionProps } from './GenericSection';

export const CodingSection: React.FC<SectionProps> = props => (
  <div>
    <p className="mb-5 text-sm text-fg-muted">Changes apply after Save. Server runs are checked again before dispatch; running programs finish under their existing limits. Browser clients refresh policy with their session settings. Disabled languages remain readable and editable. These switches do not revoke code already downloaded to an offline browser.</p>
    <GenericSection {...props} only={['coding.enabled']} />
    <h3 className="section-title my-5">Languages</h3>
    <div className="grid gap-4 sm:grid-cols-2">
      {Object.keys(props.draft.coding.languages).map(language => (
        <section key={language} className="border border-border rounded-lg p-4">
          <LanguageEmblem language={language} />
          <GenericSection {...props} only={[`coding.languages.${language}`]} />
        </section>
      ))}
    </div>
    <h3 className="section-title my-5">Workflows</h3>
    <GenericSection {...props} only={Object.keys(props.draft.coding.workflows).map(key => `coding.workflows.${key}`)} />
  </div>
);
