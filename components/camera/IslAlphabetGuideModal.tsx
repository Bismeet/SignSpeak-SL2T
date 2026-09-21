'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';

export interface IslAlphabetLetterInfo {
  letter: string;
  type: 'two-handed' | 'single-handed';
  description: string;
}

export const ISL_ALPHABET_DATA: IslAlphabetLetterInfo[] = [
  { letter: 'A', type: 'two-handed', description: 'Two thumbs touching at an angle forming the peak of "A"' },
  { letter: 'B', type: 'two-handed', description: 'Both hands form circles touching side-by-side (like eyeglasses)' },
  { letter: 'C', type: 'single-handed', description: 'One hand curved into a "C" shape' },
  { letter: 'D', type: 'two-handed', description: 'Vertical index finger with the other hand curving around it to form "D"' },
  { letter: 'E', type: 'two-handed', description: 'One hand curved, index finger of other hand points into the middle' },
  { letter: 'F', type: 'two-handed', description: 'Two fingers crossed perpendicularly over two fingers (grid/hash pattern)' },
  { letter: 'G', type: 'two-handed', description: 'Both fists stacked vertically on top of each other' },
  { letter: 'H', type: 'two-handed', description: 'One flat hand resting horizontally across the other vertical palm' },
  { letter: 'I', type: 'single-handed', description: 'Single hand with pinky (or index) pointing straight upward' },
  { letter: 'J', type: 'two-handed', description: 'Dominant hand index finger pointing across the non-dominant hand' },
  { letter: 'K', type: 'two-handed', description: 'Vertical index finger with other hand’s bent finger touching the knuckle' },
  { letter: 'L', type: 'single-handed', description: 'Thumb and index finger open at a 90° angle forming an "L"' },
  { letter: 'M', type: 'two-handed', description: 'Three fingers resting horizontally across the other open hand' },
  { letter: 'N', type: 'two-handed', description: 'Two fingers resting horizontally across the other open hand' },
  { letter: 'O', type: 'single-handed', description: 'Fingertips and thumb curving together to form an "O" loop' },
  { letter: 'P', type: 'two-handed', description: 'Vertical index finger with other hand making a circular loop at the top' },
  { letter: 'Q', type: 'two-handed', description: 'One hand forms a circle, other hand hooks its index finger into the bottom' },
  { letter: 'R', type: 'two-handed', description: 'Bent index finger resting on the palm of the other flat hand' },
  { letter: 'S', type: 'two-handed', description: 'Both pinky fingers interlinked or hooked together' },
  { letter: 'T', type: 'two-handed', description: 'Horizontal index finger resting on top of a vertical index finger ("T")' },
  { letter: 'U', type: 'single-handed', description: 'Thumb and pinky extended upward forming a "U" cup shape' },
  { letter: 'V', type: 'single-handed', description: 'Index and middle fingers spread in an upright "V" peace sign' },
  { letter: 'W', type: 'two-handed', description: 'Fingers of both hands completely interlocked together' },
  { letter: 'X', type: 'two-handed', description: 'Both index fingers crossed over each other forming an "X"' },
  { letter: 'Y', type: 'two-handed', description: 'Index finger resting in the crook between thumb and index of other hand' },
  { letter: 'Z', type: 'two-handed', description: 'One flat vertical palm with the fingertips of other hand touching its center' },
];

interface IslAlphabetGuideModalProps {
  open: boolean;
  onClose: () => void;
}

export function IslAlphabetGuideModal({ open, onClose }: IslAlphabetGuideModalProps) {
  const [filter, setFilter] = useState<'all' | 'two-handed' | 'single-handed'>('all');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);

  const filtered = ISL_ALPHABET_DATA.filter((item) => {
    if (filter === 'all') return true;
    return item.type === filter;
  });

  const activeItem = ISL_ALPHABET_DATA.find((item) => item.letter === selectedLetter) ?? null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Indian Sign Language (ISL) Alphabet Guide"
      description="Official reference signs for all 26 letters (A–Z) used by the recognition model."
      className="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Notice explaining Two-Handed ISL vs One-Handed ASL */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 shadow-sm flex items-start gap-2.5">
          <Icon name="info" className="mt-0.5 shrink-0 text-amber-600" size="1.1rem" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-950">
              Why some letters (W, F, P, etc.) require TWO hands:
            </p>
            <p className="leading-relaxed">
              In Indian Sign Language (ISL), most letters are <strong>two-handed signs</strong> (e.g. <strong>W</strong> has interlocked fingers, <strong>F</strong> crosses 2 fingers over 2, <strong>P</strong> has a vertical finger with a circle loop). If you sign one-handed (ASL style), the model will not recognise it because the second hand is missing. Please place <strong>both hands in front of the camera</strong> for two-handed letters!
            </p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                filter === 'all'
                  ? 'bg-[#596F57] text-white'
                  : 'bg-raised text-muted hover:text-ink'
              }`}
            >
              All Letters (26)
            </button>
            <button
              type="button"
              onClick={() => setFilter('two-handed')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                filter === 'two-handed'
                  ? 'bg-[#596F57] text-white'
                  : 'bg-raised text-muted hover:text-ink'
              }`}
            >
              Two-Handed (18)
            </button>
            <button
              type="button"
              onClick={() => setFilter('single-handed')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                filter === 'single-handed'
                  ? 'bg-[#596F57] text-white'
                  : 'bg-raised text-muted hover:text-ink'
              }`}
            >
              Single-Handed (8)
            </button>
          </div>
          <span className="text-xs text-muted">
            Click any letter to view details
          </span>
        </div>

        {/* Active Letter Spotlight (if clicked) */}
        {activeItem && (
          <div className="rounded-xl border border-[#596F57]/30 bg-[#F4F1EA] p-3.5 flex flex-col sm:flex-row items-center gap-4 transition-all">
            <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-lg border border-[#D8CFBA] bg-black/5 shadow-inner">
              <img
                src={`/isl-alphabet-guide/${activeItem.letter}.jpg`}
                alt={`ISL sign for letter ${activeItem.letter}`}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="space-y-1.5 text-center sm:text-left flex-1 min-w-0">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#596F57] text-white font-mono text-lg font-bold">
                  {activeItem.letter}
                </span>
                <Badge tone={activeItem.type === 'two-handed' ? 'success' : 'neutral'}>
                  {activeItem.type === 'two-handed' ? 'Two-Handed Sign' : 'Single-Handed Sign'}
                </Badge>
              </div>
              <p className="text-sm font-medium text-ink">
                {activeItem.description}
              </p>
              <p className="text-xs text-muted">
                Keep both hands clearly visible to the camera while holding the shape for ~0.4s to detect.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedLetter(null)}
              className="text-xs text-muted hover:text-ink underline self-start sm:self-center"
            >
              Close preview
            </button>
          </div>
        )}

        {/* Alphabet Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
          {filtered.map((item) => {
            const isSelected = selectedLetter === item.letter;
            return (
              <button
                key={item.letter}
                type="button"
                onClick={() => setSelectedLetter(item.letter)}
                className={`group flex flex-col items-center rounded-xl border p-2 text-left transition-all ${
                  isSelected
                    ? 'border-[#596F57] bg-[#EAE5D9] ring-2 ring-[#596F57]/40'
                    : 'border-line bg-surface hover:border-[#596F57]/50 hover:bg-raised'
                }`}
              >
                <div className="relative mb-1.5 aspect-square w-full overflow-hidden rounded-lg bg-black/5">
                  <img
                    src={`/isl-alphabet-guide/${item.letter}.jpg`}
                    alt={`Letter ${item.letter}`}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                  <span className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-md bg-black/75 font-mono text-xs font-bold text-white shadow">
                    {item.letter}
                  </span>
                </div>
                <div className="w-full text-center">
                  <span
                    className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      item.type === 'two-handed'
                        ? 'bg-[#596F57]/15 text-[#3E523C]'
                        : 'bg-neutral-200 text-neutral-700'
                    }`}
                  >
                    {item.type === 'two-handed' ? '2 Hands' : '1 Hand'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
