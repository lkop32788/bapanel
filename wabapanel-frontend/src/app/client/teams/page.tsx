'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Team {
  _id: string;
  name: string;
  description: string;
  members: { _id: string; name: string; email: string }[];
  createdAt: string;
}

export default function TeamsPage() {
  const { currentWorkspace } = useAuthStore();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Team | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchTeams = () => {
    if (!currentWorkspace) return;
    api
      .get('/teams')
      .then((r) => setTeams(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTeams();
  }, [currentWorkspace]);

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      if (editItem) {
        await api.put(`/teams/${editItem._id}`, form);
      } else {
        await api.post('/teams', form);
      }
      toast.success(translateApiMessage(editItem ? "已更新" : "已创建"));
      setShowModal(false);
      setEditItem(null);
      fetchTeams();
    } catch {
      toast.error(translateApiMessage("操作失败"));
    } finally { setSubmitting(false); }
  };

  const columns = [
    {
      key: 'name',
      title: "团队名称",
      render: (t: Team) => (
        <div>
          <span className="font-medium">{t.name}</span>
          {t.description && (
            <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'members',
      title: "成员",
      render: (t: Team) => (
        <div className="flex items-center gap-1">
          <Users className="w-4 h-4 text-gray-400" />
          <span className="text-sm">{t.members?.length || 0}</span>
        </div>
      ),
    },
    {
      key: 'created',
      title: "已创建",
      render: (t: Team) => (
        <span className="text-sm text-gray-500">
          {new Date(t.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '',
      render: (t: Team) => (
        <div className="flex gap-1">
          <button
            onClick={() => {
              setEditItem(t);
              setForm({ name: t.name, description: t.description || '' });
              setShowModal(true);
            }}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Edit className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => {
              if (confirm("删除该团队？"))
                api.delete(`/teams/${t._id}`).then(() => { fetchTeams(); toast.success(translateApiMessage("团队已删除")); }).catch(() => toast.error(translateApiMessage("删除失败")));
            }}
            className="p-1 hover:bg-red-50 rounded"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">团队</h1>
          <p className="text-sm text-gray-500 mt-1">
            管理您的团队和成员
          </p>
        </div>
        <Button
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setEditItem(null);
            setForm({ name: '', description: '' });
            setShowModal(true);
          }}
        >
          创建团队
        </Button>
      </div>

      <Table columns={columns} data={teams} loading={loading} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => api.delete(`/teams/${id}`).catch(() => null))); fetchTeams(); }} />

      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditItem(null);
        }}
        title={editItem ? "编辑团队" : "创建团队"}
      >
        <div className="space-y-4">
          <Input
            label={"团队名称"}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label={"说明"}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={"可选描述"}
          />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave}>
              {editItem ? "更新" : "创建"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowModal(false);
                setEditItem(null);
              }}
            >
              取消
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
