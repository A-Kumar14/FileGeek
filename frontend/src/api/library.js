import apiClient from './client';

export async function getLibrary() {
    const res = await apiClient.get('/library');
    return res.data;
}

export async function deleteDocument(docId) {
    await apiClient.delete(`/documents/${docId}`);
}
