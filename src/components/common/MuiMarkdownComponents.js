// src/components/common/MuiMarkdownComponents.js
import React from 'react';
import { Typography, Link, List, ListItem, Divider, Box, Paper } from '@mui/material';

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
    code: ({node, inline, className, children, ...props}) => {
        return !inline ? ( // Code block
            <Paper component="pre" elevation={0} variant="outlined" sx={{
                p: 1.5,
                my: 1,
                overflow: 'auto',
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                fontSize: '0.875rem',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap', // Ensure long lines wrap
                wordBreak: 'break-all', // Break long words/strings
            }} {...props}>
                <code>{children}</code>
            </Paper>
        ) : ( // Inline code
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
    },
    pre: ({node, ...props}) => <Box {...props} />, // The 'code' component above handles <pre><code> styling
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