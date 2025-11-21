import { useState, useRef } from 'react';

interface ImageUploadProps {
  onUploadComplete: (url: string) => void;
  onError?: (error: string) => void;
  maxSize?: number; // in MB
  acceptedTypes?: string[];
}

export default function ImageUpload({ 
  onUploadComplete, 
  onError,
  maxSize = 5,
  acceptedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    // Validate file type
    if (!acceptedTypes.includes(file.type)) {
      onError?.('Invalid file type. Please upload PNG, JPG, GIF, or WEBP.');
      return;
    }

    // Validate file size
    if (file.size > maxSize * 1024 * 1024) {
      onError?.(`File size too large. Maximum size is ${maxSize}MB.`);
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to service (similar to pinksale)
    setUploading(true);
    try {
      const url = await uploadToService(file);
      onUploadComplete(url);
    } catch (error: any) {
      onError?.(error.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const uploadToService = async (file: File): Promise<string> => {
    // Resize image first (max 500px)
    const resizedBlob = await resizeImage(file, 500);
    
    // Try multiple upload services
    const services = [
      // Service 1: Pinksale.finance upload (primary)
      async () => {
        const formData = new FormData();
        formData.append('file', resizedBlob);
        
        // Try different pinksale endpoints
        const endpoints = [
          'https://upload.pinksale.finance/api/upload',
          'https://upload.pinksale.finance/upload',
          'https://upload.pinksale.finance/api/v1/upload',
        ];
        
        for (const endpoint of endpoints) {
          try {
            const response = await fetch(endpoint, {
              method: 'POST',
              body: formData,
            });
            
            if (response.ok) {
              const data = await response.json();
              // Pinksale returns different formats, try common ones
              if (data.url) return data.url;
              if (data.data && data.data.url) return data.data.url;
              if (data.data && typeof data.data === 'string' && data.data.startsWith('http')) return data.data;
              if (data.link) return data.link;
              if (data.path) return `https://photos.pinksale.finance${data.path}`;
              if (typeof data === 'string' && data.startsWith('http')) return data;
            }
          } catch (e) {
            continue; // Try next endpoint
          }
        }
        throw new Error('Pinksale upload failed');
      },
      
      // Service 2: Imgur (fallback)
      async () => {
        const formData = new FormData();
        formData.append('image', resizedBlob);
        
        const response = await fetch('https://api.imgur.com/3/image', {
          method: 'POST',
          headers: {
            'Authorization': 'Client-ID 546c25a59c58ad7',
          },
          body: formData,
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data && data.data.link) {
            return data.data.link;
          }
        }
        throw new Error('Imgur upload failed');
      },
    ];

    // Try each service
    for (const service of services) {
      try {
        const url = await service();
        if (url && url.length <= 2000) {
          return url;
        }
      } catch (error) {
        console.log('Service failed, trying next...', error);
        continue;
      }
    }

    throw new Error('All upload services failed. Please try uploading to imgur.com manually and paste the URL.');
  };

  const resizeImage = (file: File, maxSize: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxSize) {
              height = (height * maxSize) / width;
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = (width * maxSize) / height;
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to create blob'));
          }, 'image/jpeg', 0.8);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div>
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragActive ? '#8247e5' : '#ddd'}`,
          borderRadius: '8px',
          padding: '2rem',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: dragActive ? '#f5f5f5' : '#fff',
          transition: 'all 0.2s',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes.join(',')}
          onChange={handleChange}
          style={{ display: 'none' }}
        />
        
        {uploading ? (
          <div>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
            <div>Uploading...</div>
          </div>
        ) : preview ? (
          <div>
            <img 
              src={preview} 
              alt="Preview" 
              style={{ 
                maxWidth: '200px', 
                maxHeight: '200px', 
                borderRadius: '8px',
                marginBottom: '0.5rem'
              }} 
            />
            <div style={{ fontSize: '0.875rem', color: '#888' }}>
              Click to change image
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📤</div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Click to upload</strong> or drag and drop
            </div>
            <div style={{ fontSize: '0.875rem', color: '#888' }}>
              PNG, JPG, GIF, WEBP (max {maxSize}MB)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

