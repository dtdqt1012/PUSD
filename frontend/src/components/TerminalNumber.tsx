import { useEffect, useState, useRef, memo, useMemo } from 'react';

interface TerminalNumberProps {
  value: string | number;
  prefix?: string;
  suffix?: string;
  className?: string;
  duration?: number;
  randomChars?: string;
}

const TerminalNumber = memo(function TerminalNumber({
  value,
  prefix = '',
  suffix = '',
  className = '',
  duration = 300,
  randomChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()',
}: TerminalNumberProps) {
  const [displayValue, setDisplayValue] = useState<string>(String(value));
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number | null>(null);
  const previousValueRef = useRef<string>(String(value));

  useEffect(() => {
    const newValue = String(value);
    const oldValue = previousValueRef.current;

    if (newValue === oldValue) {
      setDisplayValue(newValue);
      return;
    }

    setIsAnimating(true);
    previousValueRef.current = newValue;

    const steps = Math.min(10, Math.max(3, Math.floor(duration / 30)));
    let currentStep = 0;

    const animate = () => {
      if (currentStep < steps) {
        // Generate random characters for scrambling effect
        const scrambled = newValue
          .split('')
          .map((char) => {
            // Keep separators and special characters
            if (char === '.' || char === ',' || char === ' ' || char === '$' || char === '%') {
              return char;
            }
            // Skip if it's already a special character
            if (!/^[0-9a-zA-Z]$/.test(char)) {
              return char;
            }
            const randomIndex = Math.floor(Math.random() * randomChars.length);
            return randomChars[randomIndex];
          })
          .join('');

        setDisplayValue(scrambled);
        currentStep++;
        animationRef.current = requestAnimationFrame(() => {
          setTimeout(animate, duration / steps);
        });
      } else {
        // Final value
        setDisplayValue(newValue);
        setIsAnimating(false);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration, randomChars]);

  const spanClassName = useMemo(
    () => `terminal-number ${isAnimating ? 'scrambling' : ''} ${className}`.trim(),
    [isAnimating, className]
  );

  return (
    <span className={spanClassName}>
      {prefix}
      {displayValue}
      {suffix}
    </span>
  );
});

export default TerminalNumber;

