import { fitStars, fitText } from '../lib/format';

export function FitStars({ fit }: Readonly<{ fit: number }>) {
  return (
    <span className="fit">
      <span aria-hidden="true" className="fit-stars">
        {fitStars(fit)}
      </span>
      <span className="visually-hidden">Fit {fitText(fit)}</span>
    </span>
  );
}
