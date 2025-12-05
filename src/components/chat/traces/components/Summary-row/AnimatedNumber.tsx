import React, { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  formatter?: (value: number) => string;
  className?: string;
}

interface DigitProps {
  digit: string;
  isNumber: boolean;
  delay?: number;
}

const AnimatedDigit: React.FC<DigitProps> = ({ digit, isNumber, delay = 0 }) => {
  const [prevDigit, setPrevDigit] = useState(digit);
  const [currentDigit, setCurrentDigit] = useState(digit);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevDigitRef = useRef(digit);

  useEffect(() => {
    if (prevDigitRef.current !== digit) {
      setPrevDigit(prevDigitRef.current);
      setIsAnimating(true);

      // Update to new digit after animation starts
      const updateTimer = setTimeout(() => {
        setCurrentDigit(digit);
        prevDigitRef.current = digit;
      }, delay + 150);

      // Reset animation state
      const resetTimer = setTimeout(() => {
        setIsAnimating(false);
        setPrevDigit(digit);
      }, delay + 350);

      return () => {
        clearTimeout(updateTimer);
        clearTimeout(resetTimer);
      };
    }
  }, [digit, delay]);

  if (!isNumber) {
    return <span className="inline-block">{digit}</span>;
  }

  return (
    <span
      className="inline-block overflow-hidden relative"
      style={{
        width: '0.55em',
        height: '1.2em',
        lineHeight: '1.2em',
      }}
    >
      {/* Previous digit (slides out) */}
      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: isAnimating ? 'translateY(-100%)' : 'translateY(0)',
          opacity: isAnimating ? 0 : 1,
          transition: `transform 300ms ease-out ${delay}ms, opacity 200ms ease-out ${delay}ms`,
        }}
      >
        {prevDigit}
      </span>
      {/* Current digit (slides in) */}
      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: isAnimating ? 'translateY(0)' : 'translateY(100%)',
          opacity: isAnimating ? 1 : 0,
          transition: `transform 300ms ease-out ${delay}ms, opacity 200ms ease-out ${delay + 100}ms`,
        }}
      >
        {currentDigit}
      </span>
      {/* Static fallback when not animating */}
      {!isAnimating && (
        <span className="flex items-center justify-center">
          {currentDigit}
        </span>
      )}
    </span>
  );
};

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  formatter = (v) => Math.round(v).toLocaleString(),
  className = "",
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      setDisplayValue(value);
      prevValueRef.current = value;
    }
  }, [value]);

  const formattedValue = formatter(displayValue);
  const chars = formattedValue.split('');

  // Calculate staggered delays - rightmost digits animate first (like an odometer)
  const getDelay = (index: number) => {
    const reversedIndex = chars.length - 1 - index;
    return reversedIndex * 30; // 30ms stagger between each digit
  };

  return (
    <span className={`inline-flex items-center ${className}`}>
      {chars.map((char, index) => (
        <AnimatedDigit
          key={`${index}-${chars.length}`}
          digit={char}
          isNumber={/\d/.test(char)}
          delay={getDelay(index)}
        />
      ))}
    </span>
  );
};
