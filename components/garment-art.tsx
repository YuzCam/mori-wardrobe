export default function GarmentArt({
  kind = 'sweater',
  color = '#c9bba8',
  className = '',
}: {
  kind?: string;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`fabric-${kind}`}
          x1="40"
          y1="30"
          x2="210"
          y2="250"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={color} />
          <stop offset="1" stopColor={color} stopOpacity=".78" />
        </linearGradient>
      </defs>
      {kind === 'trousers' ? (
        <>
          <path d="M65 36h110l9 205-41 3-23-146-23 146-41-3 9-205Z" fill={color} />
          <path
            d="M66 52h108M120 53v48M69 67l23 6M171 67l-23 6M62 231l35 2M143 233l36-2"
            stroke="#493f36"
            strokeOpacity=".2"
            strokeWidth="2"
          />
          <path d="M112 37v20h12V37" stroke="#493f36" strokeOpacity=".15" />
        </>
      ) : kind === 'bag' ? (
        <>
          <path d="M70 108c0-29 18-54 50-54s50 25 50 54" stroke={color} strokeWidth="12" />
          <path d="m51 105 137 1 13 124c-47 18-112 18-160 0l10-125Z" fill={color} />
          <path
            d="M56 117h126M60 223c35 8 87 9 123 0"
            stroke="#493f36"
            strokeOpacity=".2"
            strokeWidth="2"
          />
          <path d="M114 113h13v28h-13z" fill="#b19862" />
        </>
      ) : kind === 'dress' ? (
        <>
          <path
            d="m91 37 15-8c5 14 23 14 28 0l15 8-8 83 51 119c-49 20-95 20-144 0l51-119-8-83Z"
            fill={color}
          />
          <path
            d="M100 116h40M107 139l-22 95M133 139l22 95"
            stroke="#493f36"
            strokeOpacity=".18"
            strokeWidth="2"
          />
        </>
      ) : kind === 'shoes' ? (
        <>
          <path
            d="M37 143c18-5 30-28 40-49l37 10 13 41 61 27c12 6 16 30-3 37H47c-28-5-33-44-10-66Z"
            fill={color}
          />
          <path
            d="M31 189h162M88 133l26-6M96 146l25-7M107 159l25-7"
            stroke="#fffefb"
            strokeOpacity=".65"
            strokeWidth="5"
          />
        </>
      ) : (
        <>
          <path
            d="m80 43 25-12c6 18 24 18 30 0l25 12 43 33-26 51-20-13 6 123c-31 11-56 11-86 0l6-123-20 13-26-51 43-33Z"
            fill={`url(#fabric-${kind})`}
          />
          <path
            d="M105 32c0 32 30 32 30 0M82 64l1 51M158 64l-1 51M79 226c26 6 56 6 82 0M46 107l24 12M170 120l23-14"
            stroke="#594a3d"
            strokeOpacity=".2"
            strokeWidth="3"
          />
          {kind === 'cardigan' && (
            <>
              <path d="M120 56v178" stroke="#665545" strokeOpacity=".35" strokeWidth="3" />
              {[91, 120, 149, 178, 207].map((y) => (
                <circle key={y} cx="127" cy={y} r="2.5" fill="#655544" fillOpacity=".5" />
              ))}
            </>
          )}
          {kind === 'sweater' &&
            Array.from({ length: 9 }, (_, i) => (
              <path
                key={i}
                d={`M${91 + i * 7} 90v127`}
                stroke="#fff"
                strokeOpacity=".12"
                strokeWidth="2"
              />
            ))}
        </>
      )}
    </svg>
  );
}
