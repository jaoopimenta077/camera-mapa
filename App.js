import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Callout, Marker } from 'react-native-maps';

import {
  deletePhoto,
  findAllPhotos,
  initDatabase,
  insertPhoto,
} from './src/database/photosRepository';

const INITIAL_REGION = {
  latitude: -23.55052,
  longitude: -46.633308,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export default function App() {
  const [activeScreen, setActiveScreen] = useState('gallery');
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedMapPhoto, setSelectedMapPhoto] = useState(null);
  const [feedback, setFeedback] = useState('');

  const mapRegion = useMemo(() => {
    const firstPhotoWithLocation = photos.find(
      (photo) => photo.latitude !== null && photo.longitude !== null
    );

    if (!firstPhotoWithLocation) {
      return INITIAL_REGION;
    }

    return {
      latitude: firstPhotoWithLocation.latitude,
      longitude: firstPhotoWithLocation.longitude,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    };
  }, [photos]);

  useEffect(() => {
    async function prepareApp() {
      try {
        await initDatabase();
        await loadPhotos();
      } catch (error) {
        setFeedback('Nao foi possivel iniciar o banco de dados.');
      } finally {
        setLoading(false);
      }
    }

    prepareApp();
  }, []);

  async function loadPhotos() {
    try {
      const savedPhotos = await findAllPhotos();
      setPhotos(savedPhotos);
      setFeedback('');
    } catch (error) {
      setFeedback('Erro ao carregar as imagens salvas.');
    }
  }

  function openAddModal() {
    setTitle('');
    setSelectedImage(null);
    setSelectedLocation(null);
    setFeedback('');
    setModalVisible(true);
  }

  async function requestLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (!permission.granted) {
      throw new Error('LOCATION_PERMISSION_DENIED');
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  }

  async function captureLocationForForm() {
    try {
      const coordinates = await requestLocation();
      setSelectedLocation(coordinates);
      return coordinates;
    } catch (error) {
      Alert.alert(
        'Permissao necessaria',
        'Nao foi possivel obter a localizacao atual. Autorize a localizacao para salvar a foto no mapa.'
      );
      return null;
    }
  }

  async function pickImage(source) {
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permissao necessaria',
          source === 'camera'
            ? 'Autorize o acesso a camera para tirar uma foto.'
            : 'Autorize o acesso a galeria para escolher uma imagem.'
        );
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.85,
            })
          : await ImagePicker.launchImageLibraryAsync({
              allowsEditing: true,
              aspect: [4, 3],
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.85,
            });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      setSelectedImage(result.assets[0].uri);
      await captureLocationForForm();
    } catch (error) {
      Alert.alert('Erro', 'Nao foi possivel selecionar a imagem.');
    }
  }

  async function savePhoto() {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      Alert.alert('Titulo obrigatorio', 'Informe um titulo para a imagem.');
      return;
    }

    if (!selectedImage) {
      Alert.alert('Imagem obrigatoria', 'Escolha ou tire uma foto antes de salvar.');
      return;
    }

    setSaving(true);

    try {
      const coordinates = selectedLocation || (await requestLocation());

      await insertPhoto({
        title: trimmedTitle,
        imageUri: selectedImage,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      });

      await loadPhotos();
      setModalVisible(false);
      setActiveScreen('gallery');
    } catch (error) {
      Alert.alert(
        'Nao foi possivel salvar',
        error.message === 'LOCATION_PERMISSION_DENIED'
          ? 'A localizacao e obrigatoria para cadastrar a imagem.'
          : 'Ocorreu um erro ao gravar os dados no SQLite.'
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(photo) {
    Alert.alert('Excluir imagem', `Deseja excluir "${photo.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePhoto(photo.id);
            await loadPhotos();
          } catch (error) {
            Alert.alert('Erro', 'Nao foi possivel excluir a imagem.');
          }
        },
      },
    ]);
  }

  function renderPhotoCard({ item }) {
    return (
      <View style={styles.photoCard}>
        <Image source={{ uri: item.image_uri }} style={styles.photoImage} />
        <View style={styles.photoBody}>
          <Text style={styles.photoTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.photoDate}>{formatDate(item.created_at)}</Text>
          <Text style={styles.photoCoordinates} numberOfLines={1}>
            {formatCoordinates(item.latitude, item.longitude)}
          </Text>
        </View>
        <Pressable style={styles.deleteButton} onPress={() => confirmDelete(item)}>
          <Text style={styles.deleteButtonText}>Excluir</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerEyebrow}>Galeria com Mapa</Text>
            <Text style={styles.headerTitle}>Fotos georreferenciadas</Text>
          </View>
          <Pressable style={styles.addButton} onPress={openAddModal}>
            <Text style={styles.addButtonText}>Adicionar</Text>
          </Pressable>
        </View>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, activeScreen === 'gallery' && styles.activeTab]}
            onPress={() => setActiveScreen('gallery')}
          >
            <Text style={[styles.tabText, activeScreen === 'gallery' && styles.activeTabText]}>
              Galeria
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeScreen === 'map' && styles.activeTab]}
            onPress={() => {
              setActiveScreen('map');
              setSelectedMapPhoto(null);
            }}
          >
            <Text style={[styles.tabText, activeScreen === 'map' && styles.activeTabText]}>
              Mapa
            </Text>
          </Pressable>
        </View>

        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator color="#0f766e" size="large" />
            <Text style={styles.loadingText}>Carregando imagens...</Text>
          </View>
        ) : activeScreen === 'gallery' ? (
          <FlatList
            data={photos}
            keyExtractor={(item) => String(item.id)}
            numColumns={2}
            renderItem={renderPhotoCard}
            contentContainerStyle={styles.galleryContent}
            columnWrapperStyle={photos.length > 0 ? styles.galleryRow : null}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Nenhuma imagem cadastrada</Text>
                <Text style={styles.emptyText}>
                  Adicione uma foto para salvar titulo, localizacao e data no SQLite.
                </Text>
              </View>
            }
          />
        ) : (
          <View style={styles.mapContainer}>
            <MapView style={styles.map} initialRegion={mapRegion} region={mapRegion}>
              {photos
                .filter((photo) => photo.latitude !== null && photo.longitude !== null)
                .map((photo) => (
                <Marker
                  key={photo.id}
                  coordinate={{
                    latitude: photo.latitude,
                    longitude: photo.longitude,
                  }}
                  title={photo.title}
                  description={formatDate(photo.created_at)}
                  onPress={() => setSelectedMapPhoto(photo)}
                >
                  <Callout tooltip>
                    <View style={styles.callout}>
                      <Image source={{ uri: photo.image_uri }} style={styles.calloutImage} />
                      <Text style={styles.calloutTitle} numberOfLines={2}>
                        {photo.title}
                      </Text>
                      <Text style={styles.calloutDate}>{formatDate(photo.created_at)}</Text>
                    </View>
                  </Callout>
                </Marker>
              ))}
            </MapView>
            {photos.length === 0 ? (
              <View style={styles.mapEmptyOverlay}>
                <Text style={styles.emptyTitle}>Mapa sem marcadores</Text>
                <Text style={styles.emptyText}>Cadastre uma imagem para ver o ponto no mapa.</Text>
              </View>
            ) : null}
            {selectedMapPhoto ? (
              <View style={styles.selectedMapPhotoCard}>
                <Image
                  source={{ uri: selectedMapPhoto.image_uri }}
                  style={styles.selectedMapPhotoImage}
                />
                <View style={styles.selectedMapPhotoBody}>
                  <Text style={styles.selectedMapPhotoTitle} numberOfLines={2}>
                    {selectedMapPhoto.title}
                  </Text>
                  <Text style={styles.selectedMapPhotoText}>
                    {formatDate(selectedMapPhoto.created_at)}
                  </Text>
                  <Text style={styles.selectedMapPhotoText} numberOfLines={1}>
                    {formatCoordinates(selectedMapPhoto.latitude, selectedMapPhoto.longitude)}
                  </Text>
                </View>
                <Pressable
                  style={styles.selectedMapPhotoClose}
                  onPress={() => setSelectedMapPhoto(null)}
                >
                  <Text style={styles.selectedMapPhotoCloseText}>Fechar</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
      </View>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Nova imagem</Text>
              <Text style={styles.label}>Titulo</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Ex.: Fachada da escola"
                placeholderTextColor="#94a3b8"
                style={styles.input}
              />

              <View style={styles.imagePreview}>
                {selectedImage ? (
                  <Image source={{ uri: selectedImage }} style={styles.previewImage} />
                ) : (
                  <Text style={styles.previewText}>Nenhuma imagem selecionada</Text>
                )}
              </View>

              <View style={styles.modalActionsRow}>
                <Pressable style={styles.secondaryButton} onPress={() => pickImage('gallery')}>
                  <Text style={styles.secondaryButtonText}>Galeria</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => pickImage('camera')}>
                  <Text style={styles.secondaryButtonText}>Camera</Text>
                </Pressable>
              </View>

              <View style={styles.locationBox}>
                <Text style={styles.locationLabel}>Localizacao atual</Text>
                <Text style={styles.locationText}>
                  {selectedLocation
                    ? formatCoordinates(selectedLocation.latitude, selectedLocation.longitude)
                    : 'Sera capturada ao escolher a imagem ou salvar.'}
                </Text>
                <Pressable style={styles.linkButton} onPress={captureLocationForForm}>
                  <Text style={styles.linkButtonText}>Atualizar localizacao</Text>
                </Pressable>
              </View>

              <View style={styles.modalFooter}>
                <Pressable
                  style={[styles.footerButton, styles.cancelButton]}
                  onPress={() => setModalVisible(false)}
                  disabled={saving}
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.footerButton, styles.saveButton]}
                  onPress={savePhoto}
                  disabled={saving}
                >
                  <Text style={styles.saveButtonText}>{saving ? 'Salvando...' : 'Salvar'}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatCoordinates(latitude, longitude) {
  if (latitude === null || longitude === null) {
    return 'Sem coordenadas';
  }

  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#10221f',
  },
  container: {
    flex: 1,
    backgroundColor: '#f4f7f6',
  },
  header: {
    backgroundColor: '#10221f',
    paddingHorizontal: 20,
    paddingBottom: 18,
    paddingTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  headerEyebrow: {
    color: '#99f6e4',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  addButton: {
    backgroundColor: '#2dd4bf',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addButtonText: {
    color: '#07312b',
    fontWeight: '800',
  },
  tabs: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    backgroundColor: '#ffffff',
    borderBottomColor: '#dbe7e4',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 10,
    backgroundColor: '#e8efed',
  },
  activeTab: {
    backgroundColor: '#0f766e',
  },
  tabText: {
    color: '#33514b',
    fontWeight: '800',
  },
  activeTabText: {
    color: '#ffffff',
  },
  feedback: {
    backgroundColor: '#fff7ed',
    color: '#9a3412',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#49645e',
    marginTop: 10,
  },
  galleryContent: {
    padding: 12,
    paddingBottom: 28,
    flexGrow: 1,
  },
  galleryRow: {
    gap: 12,
  },
  photoCard: {
    flex: 1,
    maxWidth: '50%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
    borderColor: '#dce8e5',
    borderWidth: 1,
  },
  photoImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#d9e5e2',
  },
  photoBody: {
    padding: 10,
    gap: 4,
  },
  photoTitle: {
    color: '#10221f',
    fontWeight: '800',
    fontSize: 15,
    minHeight: 38,
  },
  photoDate: {
    color: '#58716b',
    fontSize: 12,
  },
  photoCoordinates: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteButton: {
    borderTopColor: '#edf3f1',
    borderTopWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#b42318',
    fontWeight: '800',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 26,
  },
  emptyTitle: {
    color: '#10221f',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    color: '#58716b',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  mapEmptyOverlay: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 18,
    backgroundColor: '#fffffff2',
    borderRadius: 8,
    padding: 18,
    borderColor: '#dce8e5',
    borderWidth: 1,
  },
  callout: {
    width: 190,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 10,
    borderColor: '#dce8e5',
    borderWidth: 1,
  },
  calloutImage: {
    width: '100%',
    height: 100,
    borderRadius: 6,
    backgroundColor: '#d9e5e2',
  },
  calloutTitle: {
    color: '#10221f',
    fontWeight: '800',
    marginTop: 8,
  },
  calloutDate: {
    color: '#58716b',
    fontSize: 12,
    marginTop: 2,
  },
  selectedMapPhotoCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderColor: '#dce8e5',
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  selectedMapPhotoImage: {
    width: '100%',
    height: 210,
    backgroundColor: '#d9e5e2',
  },
  selectedMapPhotoBody: {
    padding: 12,
    gap: 4,
  },
  selectedMapPhotoTitle: {
    color: '#10221f',
    fontSize: 18,
    fontWeight: '900',
  },
  selectedMapPhotoText: {
    color: '#58716b',
    fontSize: 13,
  },
  selectedMapPhotoClose: {
    position: 'absolute',
    right: 10,
    top: 10,
    backgroundColor: '#10221fcc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectedMapPhotoCloseText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000080',
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    padding: 18,
    gap: 12,
  },
  modalTitle: {
    color: '#10221f',
    fontSize: 22,
    fontWeight: '900',
  },
  label: {
    color: '#33514b',
    fontWeight: '800',
  },
  input: {
    borderColor: '#cddbd7',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#10221f',
    fontSize: 16,
  },
  imagePreview: {
    minHeight: 190,
    borderRadius: 8,
    backgroundColor: '#edf3f1',
    borderColor: '#dce8e5',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 240,
  },
  previewText: {
    color: '#58716b',
    fontWeight: '700',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 8,
    borderColor: '#0f766e',
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#0f766e',
    fontWeight: '900',
  },
  locationBox: {
    backgroundColor: '#effaf8',
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  locationLabel: {
    color: '#0f766e',
    fontWeight: '900',
  },
  locationText: {
    color: '#33514b',
  },
  linkButton: {
    marginTop: 6,
  },
  linkButtonText: {
    color: '#0f766e',
    fontWeight: '900',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  footerButton: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 13,
  },
  cancelButton: {
    backgroundColor: '#e8efed',
  },
  cancelButtonText: {
    color: '#33514b',
    fontWeight: '900',
  },
  saveButton: {
    backgroundColor: '#0f766e',
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
});
