import { WidgetQuote } from './types';

/**
 * 48 curated quotes focusing on mindfulness, calm, resilience, and presence.
 * Rotates deterministically every 5 hours (18,000 seconds) via:
 *   floor(timestampSeconds / 18000) % 48
 */
export const CURA_MINDFUL_QUOTES: WidgetQuote[] = [
  { id: 'quote-01', text: 'Peace comes from within. Do not seek it without.', author: 'Buddha' },
  { id: 'quote-02', text: 'Smile, breathe, and go slowly.', author: 'Thich Nhat Hanh' },
  { id: 'quote-03', text: 'The present moment is filled with joy and happiness. If you are attentive, you will see it.', author: 'Thich Nhat Hanh' },
  { id: 'quote-04', text: 'Feelings come and go like clouds in a windy sky. Conscious breathing is my anchor.', author: 'Thich Nhat Hanh' },
  { id: 'quote-05', text: 'Almost everything will work again if you unplug it for a few minutes, including you.', author: 'Anne Lamott' },
  { id: 'quote-06', text: 'You do not have to control your thoughts. You just have to stop letting them control you.', author: 'Dan Millman' },
  { id: 'quote-07', text: 'Wherever you are, be there totally.', author: 'Eckhart Tolle' },
  { id: 'quote-08', text: 'In today’s rush, we all think too much, seek too much, and forget about the joy of just being.', author: 'Eckhart Tolle' },
  { id: 'quote-09', text: 'A calm mind brings inner strength and self-confidence.', author: 'Dalai Lama' },
  { id: 'quote-10', text: 'Give yourself permission to slow down and rest.', author: 'Cura Reflection' },
  { id: 'quote-11', text: 'The soul usually knows what to do to heal itself. The challenge is to silence the mind.', author: 'Caroline Myss' },
  { id: 'quote-12', text: 'Nature does not hurry, yet everything is accomplished.', author: 'Lao Tzu' },
  { id: 'quote-13', text: 'Silence is not the absence of something, but the presence of everything.', author: 'Gordon Hempton' },
  { id: 'quote-14', text: 'Within you, there is a stillness and a sanctuary to which you can retreat at any time.', author: 'Hermann Hesse' },
  { id: 'quote-15', text: 'Be gentle with yourself. You are doing the best you can.', author: 'Cura Reflection' },
  { id: 'quote-16', text: 'Mindfulness is a way of befriending ourselves and our experience.', author: 'Jon Kabat-Zinn' },
  { id: 'quote-17', text: 'You cannot stop the waves, but you can learn to surf.', author: 'Jon Kabat-Zinn' },
  { id: 'quote-18', text: 'The best way to take care of the future is to take care of the present moment.', author: 'Thich Nhat Hanh' },
  { id: 'quote-19', text: 'Breathe in peace, breathe out tension.', author: 'Cura Reflection' },
  { id: 'quote-20', text: 'Quiet the mind, and the soul will speak.', author: 'Ma Jaya Sati Bhagavati' },
  { id: 'quote-21', text: 'There is more to life than increasing its speed.', author: 'Mahatma Gandhi' },
  { id: 'quote-22', text: 'One small positive thought in the morning can change your whole day.', author: 'Dalai Lama' },
  { id: 'quote-23', text: 'Nothing can bring you peace but yourself.', author: 'Ralph Waldo Emerson' },
  { id: 'quote-24', text: 'Notice what happens when you stop trying so hard and just let things be.', author: 'Cura Reflection' },
  { id: 'quote-25', text: 'It is not daily increase, but daily decrease. Hack away at the unessential.', author: 'Bruce Lee' },
  { id: 'quote-26', text: 'Tension is who you think you should be. Relaxation is who you are.', author: 'Chinese Proverb' },
  { id: 'quote-27', text: 'Each morning we are born again. What we do today matters most.', author: 'Buddha' },
  { id: 'quote-28', text: 'Take a moment to simply arrive where you already are.', author: 'Cura Reflection' },
  { id: 'quote-29', text: 'Slow down. Notice your feet on the ground and your breath in your chest.', author: 'Cura Reflection' },
  { id: 'quote-30', text: 'Do not anticipate trouble, or worry about what may never happen. Keep in the sunlight.', author: 'Benjamin Franklin' },
  { id: 'quote-31', text: 'The mind is like water. When it’s turbulent, it’s difficult to see. When it’s calm, everything becomes clear.', author: 'Prasad Mahes' },
  { id: 'quote-32', text: 'Step by step, one breath at a time.', author: 'Cura Reflection' },
  { id: 'quote-33', text: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
  { id: 'quote-34', text: 'Life is available only in the present moment.', author: 'Thich Nhat Hanh' },
  { id: 'quote-35', text: 'Pause. Take a deep breath. Release whatever you are carrying right now.', author: 'Cura Reflection' },
  { id: 'quote-36', text: 'Your calm mind is the ultimate weapon against your challenges.', author: 'Bryant McGill' },
  { id: 'quote-37', text: 'Surrender to what is. Say yes to life — and see how life suddenly starts working for you.', author: 'Eckhart Tolle' },
  { id: 'quote-38', text: 'Small moments of stillness build deep reserves of strength.', author: 'Cura Reflection' },
  { id: 'quote-39', text: 'Simplicity is the keynote of all true elegance.', author: 'Coco Chanel' },
  { id: 'quote-40', text: 'Look past the noise and find the quiet clarity within.', author: 'Cura Reflection' },
  { id: 'quote-41', text: 'Acceptance does not mean resignation; it means understanding that something is what it is.', author: 'Michael J. Fox' },
  { id: 'quote-42', text: 'When you realize nothing is lacking, the whole world belongs to you.', author: 'Lao Tzu' },
  { id: 'quote-43', text: 'Kindness to oneself is the foundation for kindness to the world.', author: 'Cura Reflection' },
  { id: 'quote-44', text: 'The feeling of calm is always accessible beneath the surface of thought.', author: 'Cura Reflection' },
  { id: 'quote-45', text: 'He who lives in harmony with himself lives in harmony with the universe.', author: 'Marcus Aurelius' },
  { id: 'quote-46', text: 'Today, choose presence over pressure.', author: 'Cura Reflection' },
  { id: 'quote-47', text: 'Drink your tea slowly and reverently, as if it is the axis on which the world revolves.', author: 'Thich Nhat Hanh' },
  { id: 'quote-48', text: 'Rest is not idleness, but the soil from which clarity grows.', author: 'Cura Reflection' },
];

/**
 * Returns a deterministic quote for the given timestamp (defaulting to current wall clock).
 * Formula: floor(T_seconds / 18000) % 48
 */
export function getRotatingQuote(nowMs: number = Date.now()): WidgetQuote {
  const timestampSeconds = Math.floor(nowMs / 1000);
  const count = CURA_MINDFUL_QUOTES.length;
  const rawIndex = Math.floor(timestampSeconds / 18000) % count;
  const normalizedIndex = (rawIndex + count) % count;
  return CURA_MINDFUL_QUOTES[normalizedIndex];
}
