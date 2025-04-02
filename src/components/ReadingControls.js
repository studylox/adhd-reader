import React from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Typography
} from '@mui/material';

const POS_OPTIONS = [
  { value: 'noun', label: '名词' },
  { value: 'verb', label: '动词' },
  { value: 'adjective', label: '形容词' },
  { value: 'adverb', label: '副词' },
  { value: 'pronoun', label: '代词' }
];

const ReadingControls = ({
  highlightColor,
  setHighlightColor,
  readingMode,
  setReadingMode,
  selectedPos,
  setSelectedPos
}) => {
  const handlePosChange = (pos) => {
    setSelectedPos(prev =>
      prev.includes(pos)
        ? prev.filter(p => p !== pos)
        : [...prev, pos]
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6" gutterBottom>
        阅读设置
      </Typography>

      <FormControl fullWidth>
        <InputLabel>阅读模式</InputLabel>
        <Select
          value={readingMode}
          label="阅读模式"
          onChange={(e) => setReadingMode(e.target.value)}
        >
          <MenuItem value="static">高亮静息模式</MenuItem>
          <MenuItem value="dynamic">动态阅读辅助器模式</MenuItem>
        </Select>
      </FormControl>

      <TextField
        label="高亮颜色"
        type="color"
        value={highlightColor}
        onChange={(e) => setHighlightColor(e.target.value)}
        fullWidth
        InputLabelProps={{ shrink: true }}
      />

      <Typography variant="subtitle1" gutterBottom>
        选择要高亮的词性：
      </Typography>
      <FormGroup>
        {POS_OPTIONS.map((option) => (
          <FormControlLabel
            key={option.value}
            control={
              <Checkbox
                checked={selectedPos.includes(option.value)}
                onChange={() => handlePosChange(option.value)}
              />
            }
            label={option.label}
          />
        ))}
      </FormGroup>
    </Box>
  );
};

export default ReadingControls; 