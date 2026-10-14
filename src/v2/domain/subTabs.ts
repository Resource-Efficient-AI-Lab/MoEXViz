/** The Domain Specialization tab's five sub-tabs — its own module so both DomainTab.tsx and
 *  WorkedExampleModal.tsx can read `SUB_TABS`' labels without importing each other (DomainTab
 *  renders WorkedExampleModal; WorkedExampleModal only needs this list, not the whole tab). */
export type SubTab = 'map' | 'rate' | 'histogram' | 'specialists' | 'prompts';

export const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'map', label: 'Experts UMAP' },
  { id: 'rate', label: 'Avg. Activation rate per layer' },
  { id: 'histogram', label: 'Experts activation rates per layer' },
  { id: 'specialists', label: 'Top experts per category' },
  { id: 'prompts', label: 'Prompts' },
];
