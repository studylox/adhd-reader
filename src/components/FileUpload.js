import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Box, Typography, LinearProgress, Alert } from '@mui/material';
import * as pdfjsLib from 'pdfjs-dist';

// 设置PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const FileUpload = ({ setText }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const processPDF = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
        setProgress((i / pdf.numPages) * 100);
      }
      
      setText(fullText);
    } catch (err) {
      setError('PDF处理失败：' + err.message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const processTextFile = async (file) => {
    try {
      const text = await file.text();
      setText(text);
    } catch (err) {
      setError('文本文件处理失败：' + err.message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    setLoading(true);
    setError(null);
    setProgress(0);

    if (file.type === 'application/pdf') {
      await processPDF(file);
    } else {
      await processTextFile(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/*': ['.txt', '.md'],
      'application/pdf': ['.pdf']
    },
    maxSize: 100 * 1024 * 1024, // 100MB
    multiple: false
  });

  return (
    <Box>
      <Box
        {...getRootProps()}
        sx={{
          border: '2px dashed #ccc',
          borderRadius: 2,
          p: 3,
          textAlign: 'center',
          cursor: 'pointer',
          bgcolor: isDragActive ? 'action.hover' : 'background.paper',
          '&:hover': {
            bgcolor: 'action.hover'
          }
        }}
      >
        <input {...getInputProps()} />
        <Typography>
          {isDragActive
            ? '将文件拖放到这里...'
            : '点击或拖放文件到这里上传（支持.txt、.md、.pdf，最大100MB）'}
        </Typography>
      </Box>

      {loading && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress variant="determinate" value={progress} />
          <Typography variant="body2" color="text.secondary" align="center">
            {Math.round(progress)}%
          </Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
};

export default FileUpload; 