'use client'

import { useState } from 'react'

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)

  return (
    <main className="relative w-screen h-screen flex items-center justify-center bg-black text-white">
      <div className="w-[900px] max-w-[90%] flex flex-col items-center gap-8">
        
        <h1 className="text-3xl font-bold tracking-wide">
          Upload to CancerCulture
        </h1>

        {/* Upload Box */}
        <label
          className="w-full h-[280px] border-2 border-dashed border-yellow-400
                     flex items-center justify-center cursor-pointer
                     hover:bg-yellow-400/5 transition"
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                setFile(e.target.files[0])
              }
            }}
          />

          {!file ? (
            <span className="text-lg text-yellow-400">
              Click to upload an image
            </span>
          ) : (
            <span className="text-lg">
              {file.name}
            </span>
          )}
        </label>

        {/* Disclaimer */}
        <p className="text-sm text-white/70 max-w-[700px] text-center">
          Upload a real image. Add a handwritten note with 
          <span className="text-yellow-400"> #CancerCulture</span>.
          <br />
          No wallet connect. No names. No metadata during voting.
        </p>

      </div>
    </main>
  )
}
