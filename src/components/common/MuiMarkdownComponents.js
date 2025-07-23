// src/components/common/MuiMarkdownComponents.js
import React, { useState } from 'react';
import { Typography, Link, List, ListItem, Divider, Box, Paper, IconButton, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';

// Syntax Highlighting Imports
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// Choose your themes. vscDarkPlus is great for dark mode, prism is a clean light theme.
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Icon for the copy button
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';


// Custom CodeBlock component with copy-to-clipboard functionality
const CodeBlock = ({ node, inline, className, children, ...props }) => {
    const theme = useTheme();
    const [isCopied, setIsCopied] = useState(false);
    const codeString = String(children).replace(/\n$/, '');
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : 'text';

    const copyToClipboard = () => {
        navigator.clipboard.writeText(codeString).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
        }, (err) => {
            console.error('Failed to copy code: ', err);
            alert('Failed to copy code.');
        });
    };

    return !inline ? (
        <Paper
            elevation={0}
            variant="outlined"
            sx={{
                position: 'relative',
                my: 1,
                bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                '&:hover .copy-button': {
                    opacity: 1,
                },
            }}
        >
            <Tooltip title={isCopied ? 'Copied!' : 'Copy code'}>
                <IconButton
                    size="small"
                    className="copy-button"
                    onClick={copyToClipboard}
                    sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        zIndex: 1,
                        opacity: 0.2,
                        transition: 'opacity 0.2s',
                        color: 'action.active',
                        bgcolor: 'rgba(255, 255, 255, 0.1)',
                        '&:hover': {
                            bgcolor: 'rgba(255, 255, 255, 0.2)',
                        },
                    }}
                >
                    {isCopied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                </IconButton>
            </Tooltip>
            <SyntaxHighlighter
                {...props}
                children={codeString}
                style={theme.palette.mode === 'dark' ? vscDarkPlus : prism}
                language={language}
                PreTag="div"
                customStyle={{
                    margin: 0,
                    padding: '16px',
                    borderRadius: theme.shape.borderRadius,
                    backgroundColor: 'transparent', // Let the Paper component handle the background
                }}
            />
        </Paper>
    ) : (
        <Typography component="code" sx={{
            fontFamily: 'monospace',
            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            px: 0.5,
            py: 0.25,
            borderRadius: 1,
            fontSize: '0.875rem'
        }} {...props}>
            {children}
        </Typography>
    );
};


export const muiMarkdownComponentsConfig = {
    p: ({node, ...props}) => <Typography variant="body1" gutterBottom {...props} />,
    h1: ({node, ...props}) => <Typography variant="h4" component="h1" gutterBottom {...props} />,
    h2: ({node, ...props}) => <Typography variant="h5" component="h2" gutterBottom {...props} />,
    h3: ({node, ...props}) => <Typography variant="h6" component="h3" gutterBottom {...props} />,
    h4: ({node, ...props}) => <Typography variant="subtitle1" component="h4" gutterBottom {...props} />,
    h5: ({node, ...props}) => <Typography variant="subtitle2" component="h5" gutterBottom {...props} />,
    h6: ({node, ...props}) => <Typography variant="body2" component="h6" gutterBottom {...props} />,
    a: ({node, ...props}) => <Link target="_blank" rel="noopener noreferrer" {...props} />,
    ul: ({node, ordered, ...props}) => <List sx={{ listStyleType: 'disc', pl: 2.5, py:0.5 }} {...props} />,
    ol: ({node, ordered, ...props}) => <List sx={{ listStyleType: 'decimal', pl: 2.5, py:0.5 }} {...props} />,
    li: ({node, ...props}) => <ListItem sx={{ display: 'list-item', py: 0.2, px: 0 }} disableGutters {...props} />,
    hr: ({node, ...props}) => <Divider sx={{ my: 1 }} {...props} />,
    // Use the custom CodeBlock component for all code elements
    code: (props) => <CodeBlock {...props} />,
    pre: ({node, ...props}) => <Box {...props} />, // The 'code' component above handles styling
    blockquote: ({node, ...props}) => (
        <Box
            component="blockquote"
            sx={{
                borderLeft: (theme) => `4px solid ${theme.palette.divider}`,
                pl: 2,
                ml: 0,
                mr: 0,
                my: 1.5,
                fontStyle: 'italic',
                color: 'text.secondary'
            }}
            {...props}
        />
    ),
    table: ({node, ...props}) => <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', my: 1.5, '& th, & td': { border: (theme) => `1px solid ${theme.palette.divider}`, p: 1, textAlign: 'left'}}} {...props} />,
    thead: ({node, ...props}) => <Box component="thead" {...props} />,
    tbody: ({node, ...props}) => <Box component="tbody" {...props} />,
    tr: ({node, ...props}) => <Box component="tr" {...props} />,
    th: ({node, ...props}) => <Box component="th" sx={{fontWeight: 'bold', bgcolor: 'action.hover'}} {...props} />,
    td: ({node, ...props}) => <Box component="td" {...props} />,
};  